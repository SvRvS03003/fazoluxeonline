#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiUdp.h>
#include <ESPmDNS.h>
#include <Adafruit_NeoPixel.h>
#include <nvs.h>
#include <nvs_flash.h>
#include <WebServer.h>
#include <DNSServer.h>

WebServer server(80);
DNSServer dnsServer;

WiFiUDP udp;
const int localUdpPort = 4444;

const char* ssid = "TP-LINK_AFE0";
const char* password = "08830326";
const char* backendUrl = "http://192.168.1.108:8000/machines/";

int NODE_ID = 0;

const char* mesh_password = "vysoftfazo1965";

void initNodeId() {
  nvs_flash_init();
  nvs_handle_t handle;
  if (nvs_open("config", NVS_READONLY, &handle) == ESP_OK) {
    int32_t savedId;
    if (nvs_get_i32(handle, "node_id", &savedId) == ESP_OK && savedId > 0 && savedId <= 68) {
      NODE_ID = savedId;
      nvs_close(handle);
      Serial.println("Node ID from NVS: S" + String(NODE_ID));
      return;
    }
    nvs_close(handle);
  }
  
  uint32_t chipId = ESP.getChipId();
  NODE_ID = (chipId % 68) + 1;
  if (NODE_ID == 0) NODE_ID = 1;
  
  Serial.println("Node ID from Chip ID: S" + String(NODE_ID) + " (chip: " + String(chipId, HEX) + ")");
  
  if (nvs_open("config", NVS_READWRITE, &handle) == ESP_OK) {
    nvs_set_i32(handle, "node_id", NODE_ID);
    nvs_commit(handle);
    nvs_close(handle);
    Serial.println("Node ID saved to NVS");
  }
}

#define RGB_BRIGHTNESS 50
#define RGB_PIN 48
#define NUM_PIXELS 1

Adafruit_NeoPixel pixels(NUM_PIXELS, RGB_PIN, NEO_GRB + NEO_KHZ800);
#define RS485_CONTROL_PIN 4
#define RX2_PIN 16
#define TX2_PIN 17

long baudRates[] = {9600, 19200, 38400, 115200};
int currentBaudIdx = 0;
bool baudLocked = false;
bool isPriority = false;
unsigned long priorityStartTime = 0;
const unsigned long PRIORITY_DURATION = 30000;

float global_remaining = 0.0;
float shift_meters = 0.0;
float start_meters_shift = -1.0;
String detectedProtocol = "Searching...";
unsigned long lastSignalTime = 0;
unsigned long lastDataSend = 0;
const unsigned long SIGNAL_TIMEOUT = 5000;

void setRGB(uint8_t r, uint8_t g, uint8_t b) {
  pixels.setPixelColor(0, pixels.Color(r, g, b));
  pixels.show();
}

void connectWiFi() {
  WiFi.mode(WIFI_AP_STA);
  
  if (NODE_ID == 1) {
    WiFi.softAP("SvRvS.org", mesh_password, 1, 0);
    WiFi.begin(ssid, password);
  } else {
    int n = WiFi.scanNetworks();
    String bestSSID = "";
    int bestRSSI = -100;
    for (int i = 0; i < n; ++i) {
      String s = WiFi.SSID(i);
      if (s.startsWith("SvRvS_") || s == "SvRvS.org") {
        if (WiFi.RSSI(i) > bestRSSI) {
          bestRSSI = WiFi.RSSI(i);
          bestSSID = s;
        }
      }
    }
    if (bestSSID == "") bestSSID = (NODE_ID == 2) ? "SvRvS.org" : "SvRvS_S" + String(NODE_ID - 1);
    WiFi.begin(bestSSID.c_str(), mesh_password);
    WiFi.softAP(("SvRvS_S" + String(NODE_ID)).c_str(), mesh_password, 1, 1);
  }
  
  WiFi.setSleep(false);
  MDNS.begin("svrvs");

  unsigned long start = millis();
  setRGB(100, 100, 0);
  while (WiFi.status() != WL_CONNECTED && millis() - start < 10000) {
    delay(500);
    Serial.print(".");
  }
  
  if (WiFi.status() == WL_CONNECTED) {
    setRGB(0, 100, 0);
    Serial.println("\nMesh Connected");
  }
}

void checkPriorityUDP() {
  int packetSize = udp.parsePacket();
  if (packetSize) {
    char packetBuffer[255];
    int len = udp.read(packetBuffer, 255);
    if (len > 0) packetBuffer[len] = 0;
    String msg = String(packetBuffer);
    
    if (msg.startsWith("PRIORITY:")) {
      String targetId = msg.substring(9);
      if (targetId == ("S" + String(NODE_ID))) {
        isPriority = true;
        priorityStartTime = millis();
        Serial.println("SMART_MODE: Priority Activated!");
      } else {
        IPAddress broadcastIP = WiFi.softAPIP();
        broadcastIP[3] = 255;
        udp.beginPacket(broadcastIP, localUdpPort);
        udp.write((const uint8_t*)msg.c_str(), msg.length());
        udp.endPacket();
      }
    } else if (msg.startsWith("CMD:")) {
      int colon1 = msg.indexOf(':');
      int colon2 = msg.indexOf(':', colon1 + 1);
      String cmd = msg.substring(colon1 + 1, colon2);
      String targetId = msg.substring(colon2 + 1);
      
      if (targetId == ("S" + String(NODE_ID)) || targetId == "*") {
        Serial.println(("CMD Received: " + cmd).c_str());
        if (cmd == "RESET") {
          Serial.println("RESETTING...");
          ESP.restart();
        } else if (cmd == "REBOOT") {
          Serial.println("REBOOTING...");
          ESP.restart();
        } else if (cmd == "START") {
          isPriority = true;
          priorityStartTime = millis();
        } else if (cmd == "STOP") {
          isPriority = false;
        }
      } else {
        IPAddress broadcastIP = WiFi.softAPIP();
        broadcastIP[3] = 255;
        udp.beginPacket(broadcastIP, localUdpPort);
        udp.write((const uint8_t*)msg.c_str(), msg.length());
        udp.endPacket();
      }
    }
  }
}

void handleRoot() {
  String html = R"(<!DOCTYPE html><html><head><meta name='viewport' content='width=device-width, initial-scale=1'>
    <style>body{font-family:Arial;margin:20px;background:#1a1a2e;color:#eee}
    input,select{width:100%;padding:10px;margin:5px 0;background:#16213e;border:1px solid #0f3460;border-radius:5px;color:#fff}
    button{width:100%;padding:12px;background:#0f3460;color:#fff;border:none;border-radius:5px;cursor:pointer;margin:10px 0}
    .btn-save{background:#22c55e}.btn-reset{background:#ef4444}</style></head>
    <body><h1>ESP32 Config</h1>
    <p>Node ID: S)E" + String(NODE_ID) + R"(<br>IP: )E" + WiFi.localIP().toString() + R"(<br>WiFi: )E" + String(WiFi.RSSI()) + R"( dBm</p>
    <form action='/save' method='POST'>
    <label>WiFi SSID</label><input name='ssid' value=')E" + String(ssid) + R"('>
    <label>WiFi Password</label><input name='password' value=')E" + String(password) + R"(' type='password'>
    <label>Backend URL</label><input name='backend' value=')E" + String(backendUrl) + R"('>
    <button type='submit' class='btn-save'>Save</button></form>
    <form action='/reset' method='POST'><button type='submit' class='btn-reset'>Reset ESP32</button></form>
    </body></html>)";
  server.send(200, "text/html", html);
}

void handleSave() {
  if (server.hasArg("ssid")) {
    String s = server.arg("ssid");
    if (s.length() > 0 && s.length() < 33) {
      nvs_handle_t h;
      if (nvs_open("config", NVS_READWRITE, &h) == ESP_OK) {
        nvs_set_str(h, "wifi_ssid", s.c_str());
        nvs_commit(h);
        nvs_close(h);
      }
    }
  }
  if (server.hasArg("password")) {
    String p = server.arg("password");
    if (p.length() > 0 && p.length() < 65) {
      nvs_handle_t h;
      if (nvs_open("config", NVS_READWRITE, &h) == ESP_OK) {
        nvs_set_str(h, "wifi_pass", p.c_str());
        nvs_commit(h);
        nvs_close(h);
      }
    }
  }
  server.send(200, "text/html", "<!DOCTYPE html><html><head><meta http-equiv='refresh' content='3;url=/'><body style='font-family:Arial;margin:20px;background:#1a1a2e;color:#fff'><h1>Saved! Rebooting...</h1></body></html>");
  delay(1000);
  ESP.restart();
}

void handleReset() {
  server.send(200, "text/html", "<!DOCTYPE html><html><head><meta http-equiv='refresh' content='3;url=/'><body style='font-family:Arial;margin:20px;background:#1a1a2e;color:#fff'><h1>Resetting...</h1></body></html>");
  delay(500);
  ESP.restart();
}

void handleNotFound() {
  server.send(404, "text/plain", "Not Found");
}

void setup() {
  Serial.begin(115200);
  delay(500);
  initNodeId();
  pixels.begin();
  pixels.setBrightness(RGB_BRIGHTNESS);
  connectWiFi();
  udp.begin(localUdpPort);

  server.on("/", handleRoot);
  server.on("/save", HTTP_POST, handleSave);
  server.on("/reset", HTTP_POST, handleReset);
  server.onNotFound(handleNotFound);
  server.begin();

  pinMode(RS485_CONTROL_PIN, OUTPUT);
  digitalWrite(RS485_CONTROL_PIN, LOW);
  
  Serial2.begin(baudRates[currentBaudIdx], SERIAL_8N1, RX2_PIN, TX2_PIN);
}

void detectBaudRate() {
  static unsigned long lastSwitch = 0;
  static unsigned long lastReport = 0;
  
  if (millis() - lastSwitch > 1250) {
    currentBaudIdx = (currentBaudIdx + 1) % 4;
    Serial2.end();
    Serial2.begin(baudRates[currentBaudIdx], SERIAL_8N1, RX2_PIN, TX2_PIN);
    Serial.print("Scanning Baud: "); Serial.println(baudRates[currentBaudIdx]);
    lastSwitch = millis();
  }

  if (millis() - lastReport > 2000) {
    sendData(global_remaining, 0, "SEARCHING");
    lastReport = millis();
  }

  if (Serial2.available()) {
    String test = Serial2.readStringUntil('\n');
    if (test.length() > 2) {
      baudLocked = true;
      lastSignalTime = millis();
      Serial.print("SIGNAL DETECTED: "); Serial.println(baudRates[currentBaudIdx]);
      if (test.startsWith("S1:")) detectedProtocol = "TEXT_ASCII";
      else if (test.indexOf(",") != -1) detectedProtocol = "CSV";
      else detectedProtocol = "UNKNOWN_ASCII";
    }
  }
}

void loop() {
  server.handleClient();
  checkPriorityUDP();
  
  static unsigned long lastLEDUpdate = 0;
  static bool ledState = false;
  if (WiFi.status() != WL_CONNECTED) {
    if (millis() - lastLEDUpdate > 500) {
      ledState = !ledState;
      if (ledState) setRGB(100, 100, 0);
      else setRGB(0, 0, 0);
      lastLEDUpdate = millis();
    }
  } else {
    setRGB(isPriority ? 0 : 0, isPriority ? 0 : 100, isPriority ? 255 : 0);
  }

  if (isPriority && (millis() - priorityStartTime > PRIORITY_DURATION)) {
    isPriority = false;
    Serial.println("SMART_MODE: Priority Expired.");
  }

  if (!baudLocked) {
    detectBaudRate();
  } else {
    if (Serial2.available()) {
      String data = Serial2.readStringUntil('\n');
      if (data.length() > 2) {
        float meters = parseData(data);
        global_remaining = meters;
        lastSignalTime = millis();
      }
    }
    
    if (millis() - lastSignalTime > SIGNAL_TIMEOUT) {
      baudLocked = false;
      detectedProtocol = "Searching...";
    }
  }

  unsigned long interval = isPriority ? 200 : 5000;
  if (millis() - lastDataSend > interval) {
    sendData(global_remaining, baudLocked ? baudRates[currentBaudIdx] : 0, detectedProtocol);
    lastDataSend = millis();
  }
}

float parseData(String data) {
  if (detectedProtocol == "TEXT_ASCII" && data.startsWith("S1:")) {
    return data.substring(3).toFloat();
  }
  if (detectedProtocol == "CSV") {
    int firstComma = data.indexOf(',');
    return data.substring(firstComma + 1).toFloat();
  }
  return data.toFloat();
}

void sendData(float meters, long baud, String proto) {
  if (start_meters_shift < 0) start_meters_shift = meters;
  shift_meters = meters - start_meters_shift;

  String payload = "{\"node_id\":\"S" + String(NODE_ID) + "\"" +
                   ", \"meters\":" + String(meters) +
                   ", \"shift_meters\":" + String(shift_meters) +
                   ", \"baud\":" + String(baud) +
                   ", \"protocol\":\"" + proto + "\"" +
                   ", \"free_ram\":" + String(ESP.getFreeHeap()) +
                   ", \"total_ram\":" + String(ESP.getHeapSize()) +
                   ", \"free_rom\":" + String(ESP.getFreeSketchSpace()) +
                   ", \"total_rom\":" + String(ESP.getFlashChipSize()) +
                   ", \"cpu_freq\":" + String(ESP.getCpuFreqMHz()) +
                   ", \"wifi_ssid\":\"" + String(WiFi.SSID()) + "\"" +
                   ", \"wifi_rssi\":" + String(WiFi.RSSI()) + "}";
                   
  Serial.println("USB_DATA:" + payload);

  if (WiFi.status() == WL_CONNECTED || WiFi.softAPgetStationNum() > 0) {
    HTTPClient http;
    String url = String(backendUrl) + "S" + String(NODE_ID) + "/update";
    http.begin(url);
    http.addHeader("Content-Type", "application/json");
    int httpCode = http.POST(payload);
    http.end();
    
    if (httpCode <= 0 && WiFi.softAPgetStationNum() > 0) {
      for (int i = 2; i <= 5; i++) {
        String apUrl = "http://192.168.4." + String(i) + ":8000/machines/S" + String(NODE_ID) + "/update";
        http.begin(apUrl);
        http.addHeader("Content-Type", "application/json");
        http.setTimeout(500);
        int res = http.POST(payload);
        http.end();
        if (res > 0) break;
      }
    }
  }
}
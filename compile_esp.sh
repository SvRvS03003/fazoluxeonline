#!/bin/bash
cd /Users/user/Desktop/SR/esp32_firmware
arduino-cli compile --fqbn esp32:esp32:esp32s3 .
arduino-cli upload -p /dev/cu.usbmodem5C361404121 --fqbn esp32:esp32:esp32s3 .
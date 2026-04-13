Unicode true

!define APP_NAME "SR Monitor"
!define APP_EXE "SRMonitor-Control.exe"
!define APP_VERSION "1.0.0"
!define COMPANY_NAME "SR Monitor"

Name "${APP_NAME}"
OutFile "..\release\SRMonitor-Setup.exe"
InstallDir "$LOCALAPPDATA\Programs\SR Monitor"
InstallDirRegKey HKCU "Software\${COMPANY_NAME}\${APP_NAME}" "InstallDir"
RequestExecutionLevel user

!include "MUI2.nsh"

!define MUI_ABORTWARNING

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

!insertmacro MUI_LANGUAGE "English"

Section "Install"
  SetOutPath "$INSTDIR"
  WriteRegStr HKCU "Software\${COMPANY_NAME}\${APP_NAME}" "InstallDir" "$INSTDIR"

  File /r "..\release\app\*"
  WriteUninstaller "$INSTDIR\Uninstall.exe"

  CreateDirectory "$SMPROGRAMS\${APP_NAME}"
  CreateShortcut "$SMPROGRAMS\${APP_NAME}\${APP_NAME} Control Center.lnk" "$INSTDIR\Open SR Monitor Control Center.vbs"
  CreateShortcut "$SMPROGRAMS\${APP_NAME}\Uninstall.lnk" "$INSTDIR\Uninstall.exe"
  CreateShortcut "$DESKTOP\${APP_NAME}.lnk" "$INSTDIR\Open SR Monitor Control Center.vbs"
  CreateShortcut "$SMSTARTUP\${APP_NAME} Service Background.lnk" "$INSTDIR\Start SR Monitor Service Background.vbs"
SectionEnd

Section "Uninstall"
  Delete "$DESKTOP\${APP_NAME}.lnk"
  Delete "$SMSTARTUP\${APP_NAME} Service Background.lnk"
  Delete "$SMPROGRAMS\${APP_NAME}\${APP_NAME} Control Center.lnk"
  Delete "$SMPROGRAMS\${APP_NAME}\Uninstall.lnk"
  RMDir "$SMPROGRAMS\${APP_NAME}"

  Delete "$INSTDIR\${APP_EXE}"
  Delete "$INSTDIR\cloudflared.exe"
  Delete "$INSTDIR\DEPLOYMENT.md"
  Delete "$INSTDIR\install_autostart.ps1"
  Delete "$INSTDIR\Open SR Monitor Control Center.vbs"
  Delete "$INSTDIR\Start SR Monitor Service Background.vbs"
  Delete "$INSTDIR\srmonitor.runtime.json"
  Delete "$INSTDIR\Uninstall.exe"
  RMDir "$INSTDIR"

  DeleteRegKey HKCU "Software\${COMPANY_NAME}\${APP_NAME}"
SectionEnd

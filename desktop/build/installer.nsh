; Extras del instalador de CommandGlass (lo incluye electron-builder en su script NSIS).
; - Página "Star Citizen": detecta dónde está el juego y, si no, pide la carpeta.
; - Guarda lo elegido en $INSTDIR\install.json para que la app lo use al arrancar.
; - Regla de firewall para que el tablet conecte por la red local (solo redes privadas).
; Nada de esto escribe en la carpeta del juego.

!include MUI2.nsh
!include nsDialogs.nsh
!include LogicLib.nsh

; Textos en inglés (1033) y en español (3082): el instalador usa el idioma de Windows.
LangString CgFirewall 1033 "CommandGlass: tablet connection over the local network"
LangString CgFirewall 3082 "CommandGlass: conexión del tablet por la red local"

!ifndef BUILD_UNINSTALLER

LangString CgNotFound 1033 "I couldn't find Star Citizen on this PC. If it's installed, click Browse and choose its folder. If you don't have it yet, you can continue and choose it later from CommandGlass."
LangString CgNotFound 3082 "No he encontrado Star Citizen en este PC. Si lo tienes instalado, pulsa Examinar y elige su carpeta. Si aún no lo tienes, puedes seguir y elegirla más tarde desde CommandGlass."
LangString CgWrongDir 1033 "Star Citizen isn't in that folder. Choose the StarCitizen folder or its LIVE subfolder (the one that contains Data.p4k)."
LangString CgWrongDir 3082 "En esa carpeta no está Star Citizen. Elige la carpeta StarCitizen o su subcarpeta LIVE (la que contiene Data.p4k)."
LangString CgFoundAt 1033 "Star Citizen found in:"
LangString CgFoundAt 3082 "Star Citizen encontrado en:"
LangString CgPickDir 1033 "Choose the Star Citizen folder (StarCitizen or its LIVE subfolder)"
LangString CgPickDir 3082 "Elige la carpeta de Star Citizen (StarCitizen o su subcarpeta LIVE)"
LangString CgPageSub 1033 "Where is the game installed?"
LangString CgPageSub 3082 "¿Dónde está instalado el juego?"
LangString CgIntro 1033 "CommandGlass reads Star Citizen's log to know what's happening in your game. It only reads it: it doesn't change anything in the game."
LangString CgIntro 3082 "CommandGlass lee el registro de Star Citizen para saber qué pasa en tu partida. Solo lo lee: no modifica nada del juego."
LangString CgDirLabel 1033 "Game folder:"
LangString CgDirLabel 3082 "Carpeta del juego:"
LangString CgBrowseBtn 1033 "Browse..."
LangString CgBrowseBtn 3082 "Examinar..."
LangString CgSkipAsk 1033 "You haven't chosen the Star Citizen folder.$\r$\n$\r$\nContinue without it? You can choose it later from the CommandGlass window."
LangString CgSkipAsk 3082 "No has indicado la carpeta de Star Citizen.$\r$\n$\r$\n¿Quieres seguir sin ella? Podrás elegirla después desde la ventana de CommandGlass."
LangString CgWrongDirBox 1033 "Star Citizen isn't in that folder.$\r$\n$\r$\nChoose the StarCitizen folder or its LIVE subfolder (the one that contains Data.p4k)."
LangString CgWrongDirBox 3082 "En esa carpeta no está Star Citizen.$\r$\n$\r$\nElige la carpeta StarCitizen o su subcarpeta LIVE (la que contiene Data.p4k)."

Var CgGameDir
Var CgDirField
Var CgStatusLabel
Var CgDetected

; Ejecuta detect-sc.ps1 (log del lanzador de RSI + rutas habituales) y deja el resultado en $CgGameDir.
Function CgDetectGameDir
  InitPluginsDir
  File "/oname=$PLUGINSDIR\detect-sc.ps1" "${BUILD_RESOURCES_DIR}\detect-sc.ps1"
  nsExec::ExecToStack '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$PLUGINSDIR\detect-sc.ps1"'
  Pop $0
  Pop $1
  ; Quita saltos de línea del final.
  cg_trim:
    StrCpy $2 $1 1 -1
    StrCmp $2 "$\r" cg_cut
    StrCmp $2 "$\n" cg_cut
    Goto cg_trimmed
  cg_cut:
    StrCpy $1 $1 -1
    Goto cg_trim
  cg_trimmed:
  StrCpy $CgGameDir $1
FunctionEnd

; Entrada y salida en $R0. Acepta …\StarCitizen o …\Roberts Space Industries y baja hasta LIVE. "" si no vale.
Function CgNormalize
  ${If} ${FileExists} "$R0\Data.p4k"
  ${OrIf} ${FileExists} "$R0\Game.log"
    Return
  ${EndIf}
  ${If} ${FileExists} "$R0\LIVE\Data.p4k"
    StrCpy $R0 "$R0\LIVE"
    Return
  ${EndIf}
  ${If} ${FileExists} "$R0\StarCitizen\LIVE\Data.p4k"
    StrCpy $R0 "$R0\StarCitizen\LIVE"
    Return
  ${EndIf}
  StrCpy $R0 ""
FunctionEnd

Function CgUpdateStatus
  ${NSD_GetText} $CgDirField $R0
  ${If} $R0 == ""
    ${NSD_SetText} $CgStatusLabel "$(CgNotFound)"
    Return
  ${EndIf}
  Call CgNormalize
  ${If} $R0 == ""
    ${NSD_SetText} $CgStatusLabel "$(CgWrongDir)"
  ${Else}
    ${NSD_SetText} $CgStatusLabel "$(CgFoundAt)$\r$\n$R0"
  ${EndIf}
FunctionEnd

Function CgOnChange
  Pop $0
  Call CgUpdateStatus
FunctionEnd

Function CgBrowse
  Pop $0
  ${NSD_GetText} $CgDirField $1
  nsDialogs::SelectFolderDialog "$(CgPickDir)" "$1"
  Pop $1
  ${If} $1 != error
    ${NSD_SetText} $CgDirField "$1"
    Call CgUpdateStatus
  ${EndIf}
FunctionEnd

Function CgGamePageCreate
  ${If} $CgDetected != "1"
    Call CgDetectGameDir
    StrCpy $CgDetected "1"
  ${EndIf}
  !insertmacro MUI_HEADER_TEXT "Star Citizen" "$(CgPageSub)"
  nsDialogs::Create 1018
  Pop $0
  ${If} $0 == error
    Abort
  ${EndIf}
  ${NSD_CreateLabel} 0 0 100% 30u "$(CgIntro)"
  Pop $0
  ${NSD_CreateLabel} 0 34u 100% 10u "$(CgDirLabel)"
  Pop $0
  ${NSD_CreateDirRequest} 0 46u 74% 13u "$CgGameDir"
  Pop $CgDirField
  ${NSD_OnChange} $CgDirField CgOnChange
  ${NSD_CreateBrowseButton} 76% 45u 24% 15u "$(CgBrowseBtn)"
  Pop $0
  ${NSD_OnClick} $0 CgBrowse
  ${NSD_CreateLabel} 0 68u 100% 44u ""
  Pop $CgStatusLabel
  Call CgUpdateStatus
  nsDialogs::Show
FunctionEnd

Function CgGamePageLeave
  ${NSD_GetText} $CgDirField $R0
  ${If} $R0 == ""
    MessageBox MB_YESNO|MB_ICONQUESTION "$(CgSkipAsk)" IDYES cg_skip
    Abort
    cg_skip:
    StrCpy $CgGameDir ""
    Return
  ${EndIf}
  Call CgNormalize
  ${If} $R0 == ""
    MessageBox MB_OK|MB_ICONEXCLAMATION "$(CgWrongDirBox)"
    Abort
  ${EndIf}
  StrCpy $CgGameDir $R0
FunctionEnd

; Duplica las barras invertidas para escribir la ruta dentro de un JSON. Entrada y salida por la pila.
Function CgJsonEscape
  Exch $R1
  Push $R2
  Push $R3
  Push $R4
  StrCpy $R2 ""
  StrCpy $R3 0
  cg_esc_loop:
    StrCpy $R4 $R1 1 $R3
    StrCmp $R4 "" cg_esc_done
    StrCmp $R4 "\" 0 +2
      StrCpy $R4 "\\"
    StrCpy $R2 "$R2$R4"
    IntOp $R3 $R3 + 1
    Goto cg_esc_loop
  cg_esc_done:
  StrCpy $R1 $R2
  Pop $R4
  Pop $R3
  Pop $R2
  Exch $R1
FunctionEnd

!endif

!macro customPageAfterChangeDir
  !ifndef BUILD_UNINSTALLER
    Page custom CgGamePageCreate CgGamePageLeave
  !endif
!macroend

!macro customInstall
  !ifndef BUILD_UNINSTALLER
    ; En una actualización silenciosa no hay página: se conserva el install.json anterior si lo hubiera.
    ${If} $CgGameDir != ""
      Push $CgGameDir
      Call CgJsonEscape
      Pop $1
      FileOpen $0 "$INSTDIR\install.json" w
      FileWriteWord $0 0xFEFF
      FileWriteUTF16LE $0 '{"gameDir":"$1"}'
      FileClose $0
    ${EndIf}
  !endif
  nsExec::Exec '"$SYSDIR\netsh.exe" advfirewall firewall delete rule name="CommandGlass"'
  Pop $0
  nsExec::Exec '"$SYSDIR\netsh.exe" advfirewall firewall add rule name="CommandGlass" dir=in action=allow program="$INSTDIR\CommandGlass.exe" enable=yes profile=private description="$(CgFirewall)"'
  Pop $0
!macroend

!macro customUnInstall
  nsExec::Exec '"$SYSDIR\netsh.exe" advfirewall firewall delete rule name="CommandGlass"'
  Pop $0
!macroend

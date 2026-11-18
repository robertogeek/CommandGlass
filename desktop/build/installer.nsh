; Extras del instalador de CommandGlass (lo incluye electron-builder en su script NSIS).
; - Página "Star Citizen": detecta dónde está el juego y, si no, pide la carpeta.
; - Guarda lo elegido en $INSTDIR\install.json para que la app lo use al arrancar.
; - Regla de firewall para que el tablet conecte por la red local (solo redes privadas).
; Nada de esto escribe en la carpeta del juego.

!include MUI2.nsh
!include nsDialogs.nsh
!include LogicLib.nsh

!ifndef BUILD_UNINSTALLER

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
    ${NSD_SetText} $CgStatusLabel "No he encontrado Star Citizen en este PC. Si lo tienes instalado, pulsa Examinar y elige su carpeta. Si aún no lo tienes, puedes seguir y elegirla más tarde desde CommandGlass."
    Return
  ${EndIf}
  Call CgNormalize
  ${If} $R0 == ""
    ${NSD_SetText} $CgStatusLabel "En esa carpeta no está Star Citizen. Elige la carpeta StarCitizen o su subcarpeta LIVE (la que contiene Data.p4k)."
  ${Else}
    ${NSD_SetText} $CgStatusLabel "Star Citizen encontrado en:$\r$\n$R0"
  ${EndIf}
FunctionEnd

Function CgOnChange
  Pop $0
  Call CgUpdateStatus
FunctionEnd

Function CgBrowse
  Pop $0
  ${NSD_GetText} $CgDirField $1
  nsDialogs::SelectFolderDialog "Elige la carpeta de Star Citizen (StarCitizen o su subcarpeta LIVE)" "$1"
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
  !insertmacro MUI_HEADER_TEXT "Star Citizen" "¿Dónde está instalado el juego?"
  nsDialogs::Create 1018
  Pop $0
  ${If} $0 == error
    Abort
  ${EndIf}
  ${NSD_CreateLabel} 0 0 100% 30u "CommandGlass lee el registro de Star Citizen para saber qué pasa en tu partida. Solo lo lee: no modifica nada del juego."
  Pop $0
  ${NSD_CreateLabel} 0 34u 100% 10u "Carpeta del juego:"
  Pop $0
  ${NSD_CreateDirRequest} 0 46u 74% 13u "$CgGameDir"
  Pop $CgDirField
  ${NSD_OnChange} $CgDirField CgOnChange
  ${NSD_CreateBrowseButton} 76% 45u 24% 15u "Examinar..."
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
    MessageBox MB_YESNO|MB_ICONQUESTION "No has indicado la carpeta de Star Citizen.$\r$\n$\r$\n¿Quieres seguir sin ella? Podrás elegirla después desde la ventana de CommandGlass." IDYES cg_skip
    Abort
    cg_skip:
    StrCpy $CgGameDir ""
    Return
  ${EndIf}
  Call CgNormalize
  ${If} $R0 == ""
    MessageBox MB_OK|MB_ICONEXCLAMATION "En esa carpeta no está Star Citizen.$\r$\n$\r$\nElige la carpeta StarCitizen o su subcarpeta LIVE (la que contiene Data.p4k)."
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
  nsExec::Exec '"$SYSDIR\netsh.exe" advfirewall firewall add rule name="CommandGlass" dir=in action=allow program="$INSTDIR\CommandGlass.exe" enable=yes profile=private description="CommandGlass: conexión del tablet por la red local"'
  Pop $0
!macroend

!macro customUnInstall
  nsExec::Exec '"$SYSDIR\netsh.exe" advfirewall firewall delete rule name="CommandGlass"'
  Pop $0
!macroend

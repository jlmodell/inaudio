; Inaudio's installer and uninstaller pages: a moving hero on top, a title and a few plain
; sentences below, like the billboards inside the app.
;
; electron-builder includes this file (nsis.include in electron-builder.yml) before MUI2, so
; anything that touches MUI lives in macros the templates insert later. Builds run with -WX:
; a function or variable that one build does not use fails that build, so the installer and
; the uninstaller each insert only their own.
;
; The frames come from scripts/build-installer-art.mjs (out/installer-art). Updates install
; silently, but one started by an older version is not, so every page steps aside when
; ${isUpdated}.

!define INAUDIO_ART "${PROJECT_DIR}\out\installer-art"
!define INAUDIO_FRAMES 20
!define INAUDIO_TICK_MS 70

!macro customHeader
  ; Real pixels on high-DPI screens; the hero picks its 2x frames there.
  ManifestDPIAware true
!macroend

!macro customInstallMode
  ; For this user only, no administrator rights, unless Inaudio is already installed for everyone.
  ${if} $hasPerMachineInstallation == "1"
    StrCpy $isForceMachineInstall "1"
  ${else}
    StrCpy $isForceCurrentInstall "1"
  ${endif}
!macroend

; The hero: one bitmap control whose image is swapped on a timer. UN is "" or "un.".
!macro INAUDIO_HERO_FUNCTIONS UN
  Var inaudioPage
  Var inaudioHero
  Var inaudioHeroImage
  Var inaudioFrame
  Var inaudioFrames
  Var inaudioFrameDir
  Var inaudioTitleFont
  Var inaudioBodyFont

  Function ${UN}inaudioHeroShow
    ; Swap in the next frame, then free the one it replaced.
    IntFmt $0 "%02d" $inaudioFrame
    Push $inaudioHeroImage
    ${NSD_SetStretchedImage} $inaudioHero "$inaudioFrameDir\$0.bmp" $inaudioHeroImage
    Pop $0
    ${NSD_FreeImage} $0
  FunctionEnd

  Function ${UN}inaudioHeroTick
    IntOp $inaudioFrame $inaudioFrame + 1
    ${if} $inaudioFrame >= $inaudioFrames
      StrCpy $inaudioFrame 0
    ${endif}
    Call ${UN}inaudioHeroShow
  FunctionEnd

  Function ${UN}inaudioHeroStop
    GetFunctionAddress $0 ${UN}inaudioHeroTick
    nsDialogs::KillTimer $0
  FunctionEnd
!macroend

; Unpacks a frame set and starts the page: white ground, hero across the top. Inside a pre function.
!macro INAUDIO_PAGE_BEGIN UN SET COUNT
  InitPluginsDir
  SetOutPath "$PLUGINSDIR\inaudio\${SET}"
  File /r "${INAUDIO_ART}\${SET}\*.*"
  System::Call 'user32::GetDpiForWindow(p $HWNDPARENT) i .r0'
  IntCmp $0 110 +3 +3 0
    StrCpy $inaudioFrameDir "$PLUGINSDIR\inaudio\${SET}\2x"
    Goto +2
  StrCpy $inaudioFrameDir "$PLUGINSDIR\inaudio\${SET}\1x"
  StrCpy $inaudioFrames ${COUNT}
  StrCpy $inaudioFrame 0
  StrCpy $inaudioHeroImage 0

  ${if} $inaudioTitleFont == ""
    CreateFont $inaudioTitleFont "Segoe UI Semibold" 14 600
    CreateFont $inaudioBodyFont "Segoe UI" 10 400
  ${endif}

  nsDialogs::Create 1044
  Pop $inaudioPage
  SetCtlColors $inaudioPage "" "FFFFFF"
  ${NSD_CreateBitmap} 0 0 100% 48% ""
  Pop $inaudioHero
  Call ${UN}inaudioHeroShow
!macroend

; A line of text at Y (percent of the page) in one of the two fonts and colours.
!macro INAUDIO_TEXT Y HEIGHT TEXT FONT COLOR
  ${NSD_CreateLabel} 7% ${Y} 86% ${HEIGHT} "${TEXT}"
  Pop $0
  SetCtlColors $0 "${COLOR}" "FFFFFF"
  SendMessage $0 ${WM_SETFONT} ${FONT} 1
!macroend

; Shows the page with the Next button labelled NEXT; the hero moves while it is open.
!macro INAUDIO_PAGE_SHOW UN NEXT
  GetDlgItem $0 $HWNDPARENT 1
  SendMessage $0 ${WM_SETTEXT} 0 "STR:${NEXT}"
  ${if} $inaudioFrames > 1
    GetFunctionAddress $0 ${UN}inaudioHeroTick
    nsDialogs::CreateTimer $0 ${INAUDIO_TICK_MS}
  ${endif}
  Call ${UN}muiPageLoadFullWindow
  nsDialogs::Show
  Call ${UN}muiPageUnloadFullWindow
  ${NSD_FreeImage} $inaudioHeroImage
!macroend

; The last page: no Back, no Cancel, just the button that closes the wizard.
!macro INAUDIO_LAST_PAGE_BUTTONS
  GetDlgItem $0 $HWNDPARENT 2
  ShowWindow $0 ${SW_HIDE}
  GetDlgItem $0 $HWNDPARENT 3
  ShowWindow $0 ${SW_HIDE}
!macroend

; ----- Installer -----

!macro customWelcomePage
  !insertmacro INAUDIO_HERO_FUNCTIONS ""
  !insertmacro MUI_PAGE_INIT
  !insertmacro MUI_PAGE_FUNCTION_FULLWINDOW
  Page custom inaudioWelcomePre inaudioWelcomeLeave

  Function inaudioWelcomePre
    ${if} ${isUpdated}
      Abort
    ${endif}
    !insertmacro INAUDIO_PAGE_BEGIN "" install ${INAUDIO_FRAMES}
    !insertmacro INAUDIO_TEXT 53% 10% "Install ${PRODUCT_NAME} ${VERSION}" $inaudioTitleFont "14161A"
    !insertmacro INAUDIO_TEXT 64% 18% "Read selected or typed text aloud on this computer. The voice stays on this machine and is never uploaded." $inaudioBodyFont "5B6270"
    !insertmacro INAUDIO_TEXT 85% 8% "Installs for you only. It takes a few seconds." $inaudioBodyFont "8A919C"
    !insertmacro INAUDIO_PAGE_SHOW "" "&Install"
  FunctionEnd

  Function inaudioWelcomeLeave
    Call inaudioHeroStop
  FunctionEnd
!macroend

!macro customPageAfterChangeDir
  !define MUI_PAGE_HEADER_TEXT "Installing ${PRODUCT_NAME}"
  !define MUI_PAGE_HEADER_SUBTEXT "Copying the app."
!macroend

!macro customInstall
  ; Straight from the progress bar to the finish page, without a "Completed" stop between.
  SetAutoClose true
!macroend

!macro customFinishPage
  Var inaudioOpenBox
  !insertmacro MUI_PAGE_INIT
  Page custom inaudioFinishPre inaudioFinishLeave

  Function inaudioFinishPre
    ${if} ${isUpdated}
      ; An update started by an older version: open the new one, as a silent update would.
      ${StdUtils.ExecShellAsUser} $0 "$launchLink" "open" "--updated"
      Abort
    ${endif}
    !insertmacro INAUDIO_PAGE_BEGIN "" ready ${INAUDIO_FRAMES}
    !insertmacro INAUDIO_TEXT 53% 10% "${PRODUCT_NAME} is ready" $inaudioTitleFont "14161A"
    !insertmacro INAUDIO_TEXT 64% 18% "Find it in the Start menu. The first time it opens, setup walks you through the Kokoro voice." $inaudioBodyFont "5B6270"
    ${NSD_CreateCheckbox} 7% 84% 86% 9% "&Open ${PRODUCT_NAME} now"
    Pop $inaudioOpenBox
    SetCtlColors $inaudioOpenBox "14161A" "FFFFFF"
    SendMessage $inaudioOpenBox ${WM_SETFONT} $inaudioBodyFont 1
    ${NSD_Check} $inaudioOpenBox
    !insertmacro INAUDIO_LAST_PAGE_BUTTONS
    !insertmacro INAUDIO_PAGE_SHOW "" "&Finish"
  FunctionEnd

  Function inaudioFinishLeave
    Call inaudioHeroStop
    ${NSD_GetState} $inaudioOpenBox $0
    ${if} $0 == ${BST_CHECKED}
      ${StdUtils.ExecShellAsUser} $0 "$launchLink" "open" ""
    ${endif}
  FunctionEnd
!macroend

; ----- Uninstaller -----

!macro customUnWelcomePage
  Var inaudioDeleteBox
  Var inaudioDeleteData
  !insertmacro INAUDIO_HERO_FUNCTIONS "un."
  !insertmacro MUI_UNPAGE_INIT
  !insertmacro MUI_PAGE_FUNCTION_FULLWINDOW
  UninstPage custom un.inaudioRemovePre un.inaudioRemoveLeave

  Function un.inaudioRemovePre
    StrCpy $inaudioDeleteData ${BST_UNCHECKED}
    !insertmacro INAUDIO_PAGE_BEGIN "un." remove ${INAUDIO_FRAMES}
    !insertmacro INAUDIO_TEXT 53% 10% "Remove ${PRODUCT_NAME}?" $inaudioTitleFont "14161A"
    !insertmacro INAUDIO_TEXT 64% 18% "The app and its shortcuts are removed. Your settings and voice stay, so a reinstall picks up where you left off." $inaudioBodyFont "5B6270"
    ${NSD_CreateCheckbox} 7% 84% 86% 9% "Also &delete my settings and voice"
    Pop $inaudioDeleteBox
    SetCtlColors $inaudioDeleteBox "14161A" "FFFFFF"
    SendMessage $inaudioDeleteBox ${WM_SETFONT} $inaudioBodyFont 1
    !insertmacro INAUDIO_PAGE_SHOW "un." "&Remove"
  FunctionEnd

  Function un.inaudioRemoveLeave
    Call un.inaudioHeroStop
    ${NSD_GetState} $inaudioDeleteBox $inaudioDeleteData
  FunctionEnd

  !define MUI_PAGE_HEADER_TEXT "Removing ${PRODUCT_NAME}"
  !define MUI_PAGE_HEADER_SUBTEXT "This takes a few seconds."
!macroend

!macro customUnInstall
  ; Only when asked on the first page, and never during an update.
  ${if} $inaudioDeleteData == ${BST_CHECKED}
  ${andIfNot} ${isUpdated}
    ${if} $installMode == "all"
      SetShellVarContext current
    ${endif}
    RMDir /r "$APPDATA\${APP_FILENAME}"
    !ifdef APP_PRODUCT_FILENAME
      RMDir /r "$APPDATA\${APP_PRODUCT_FILENAME}"
    !endif
    ${if} $installMode == "all"
      SetShellVarContext all
    ${endif}
  ${endif}
!macroend

!macro customUninstallPage
  !insertmacro MUI_UNPAGE_INIT
  UninstPage custom un.inaudioDonePre un.inaudioDoneLeave

  Function un.inaudioDonePre
    !insertmacro INAUDIO_PAGE_BEGIN "un." removed 1
    !insertmacro INAUDIO_TEXT 53% 10% "${PRODUCT_NAME} was removed" $inaudioTitleFont "14161A"
    ${if} $inaudioDeleteData == ${BST_CHECKED}
      !insertmacro INAUDIO_TEXT 64% 18% "Your settings and voice were deleted too." $inaudioBodyFont "5B6270"
    ${else}
      !insertmacro INAUDIO_TEXT 64% 18% "Your settings and voice are still in your profile folder. Installing ${PRODUCT_NAME} again brings them back." $inaudioBodyFont "5B6270"
    ${endif}
    !insertmacro INAUDIO_LAST_PAGE_BUTTONS
    !insertmacro INAUDIO_PAGE_SHOW "un." "&Close"
  FunctionEnd

  Function un.inaudioDoneLeave
    Call un.inaudioHeroStop
  FunctionEnd

  ; The stock finish page that follows says the same thing: skip it.
  Function un.inaudioSkipFinish
    Abort
  FunctionEnd
  !define MUI_PAGE_CUSTOMFUNCTION_PRE un.inaudioSkipFinish
!macroend

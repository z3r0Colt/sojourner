; Hooked into Tauri's generated installer.nsi (bundle.windows.nsis.installerHooks).
;
; content.db ships as a resource but is not read-only: "Add file" imports a
; reader's own Bibles and commentaries into it, so the app keeps it in WAL
; mode and SQLite puts content.db-wal and content.db-shm beside it on first
; open. The generated uninstaller only deletes what it installed, so those
; two files stayed behind and kept the install folder alive after uninstall.

; Before the files land, whether first install or upgrade: a write-ahead log
; left by a copy of content.db that is about to be replaced must not be
; replayed onto the new one. If the app is still running these fail quietly
; and the running-app check that follows takes over.
!macro NSIS_HOOK_PREINSTALL
  Delete "$INSTDIR\content.db-wal"
  Delete "$INSTDIR\content.db-shm"
!macroend

; After the generated section has removed everything it knows about (and
; already tried, and failed, to remove the folder).
!macro NSIS_HOOK_POSTUNINSTALL
  Delete "$INSTDIR\content.db-wal"
  Delete "$INSTDIR\content.db-shm"
  RMDir "$INSTDIR"
!macroend

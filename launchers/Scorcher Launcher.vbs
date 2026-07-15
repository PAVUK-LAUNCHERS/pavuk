Set fso = CreateObject("Scripting.FileSystemObject")
Set ws  = CreateObject("WScript.Shell")

Dim root
root = fso.GetParentFolderName(fso.GetParentFolderName(WScript.ScriptFullName))

Dim electron
electron = root & "\node_modules\electron\dist\electron.exe"

Dim scorchjs
scorchjs = root & "\src\scorcher\scorcher_main.js"

If Not fso.FileExists(electron) Then
    MsgBox "Not found: " & electron, 16, "SCOROBEY"
    WScript.Quit
End If

If Not fso.FileExists(scorchjs) Then
    MsgBox "Not found: " & scorchjs, 16, "SCOROBEY"
    WScript.Quit
End If

Dim flagFile
flagFile = ws.ExpandEnvironmentStrings("%APPDATA%") & "\scorobey-shortcut.flag"

If Not fso.FileExists(flagFile) Then
    Dim desktop
    desktop = ws.SpecialFolders("Desktop")

    Dim lnk
    Set lnk = ws.CreateShortcut(desktop & "\SCOROBEY.lnk")
    lnk.TargetPath       = WScript.ScriptFullName
    lnk.IconLocation     = root & "\assets\icons\SCOROBEY.ico, 0"
    lnk.Description      = "SCOROBEY"
    lnk.WorkingDirectory = root
    lnk.Save()
    Set lnk = Nothing

    fso.CreateTextFile(flagFile, True).Close
End If

ws.Run """" & electron & """ """ & scorchjs & """ --no-sandbox", 1, False

Set ws  = Nothing
Set fso = Nothing

Set fso = CreateObject("Scripting.FileSystemObject")
Set ws  = CreateObject("WScript.Shell")

Dim root
root = fso.GetParentFolderName(fso.GetParentFolderName(WScript.ScriptFullName))

Dim electron
electron = root & "\node_modules\electron\dist\electron.exe"

Dim mainjs
mainjs = root & "\main.js"

If Not fso.FileExists(electron) Then
    MsgBox "Not found: " & electron, 16, "PAVUK"
    WScript.Quit
End If

If Not fso.FileExists(mainjs) Then
    MsgBox "Not found: " & mainjs, 16, "PAVUK"
    WScript.Quit
End If

Dim flagFile
flagFile = ws.ExpandEnvironmentStrings("%APPDATA%") & "\pavuk-shortcut.flag"

If Not fso.FileExists(flagFile) Then
    Dim desktop
    desktop = ws.SpecialFolders("Desktop")

    Dim lnk
    Set lnk = ws.CreateShortcut(desktop & "\PAVUK.lnk")
    lnk.TargetPath       = WScript.ScriptFullName
    lnk.IconLocation     = root & "\assets\icons\PAVUK.ico, 0"
    lnk.Description      = "PAVUK"
    lnk.WorkingDirectory = root
    lnk.Save()
    Set lnk = Nothing

    fso.CreateTextFile(flagFile, True).Close
End If

ws.Run """" & electron & """ """ & mainjs & """ --no-sandbox", 1, False

Set ws  = Nothing
Set fso = Nothing

#Requires AutoHotkey v2.0+

; 快捷键设置为 Ctrl+Alt+L
^!l::GetAllLnkTargetsUnderMouse()

; 按文件名中的数字部分排序
SortByNumericName(paths) {
    ; 获取数组的长度
    n := paths.Length

    ; 使用冒泡排序（Bubble Sort）方法进行排序
    for i, path1 in paths {
        ; i 为当前循环的索引，路径为 path1
        for j, path2 in paths {
            ; 提取文件名中的数字部分并转换为整数
            numA := Floor(ExtractNumberFromFileName(path1))
            numB := Floor(ExtractNumberFromFileName(path2))
            
            ; 如果路径1的数字大于路径2的数字，则交换
            if (numA < numB) {
                ; 交换位置
                temp := paths[i]
                paths[i] := paths[j]
                paths[j] := temp
            }
        }
    }
    return paths
}

; 提取文件名中的数字部分
ExtractNumberFromFileName(filePath) {
    ; 提取文件名中的数字部分
    RegExMatch(RegExReplace(filePath, ".*\\(.*)\.(.*)", "$1"), "\d+", &OutNumber)
    return OutNumber[] ? OutNumber[] : 0  ; 如果没有找到数字，返回 0
}

; 获取当前鼠标聚焦所在目录的所有 .lnk 文件目标路径
GetAllLnkTargetsUnderMouse() {
    try {
        folderPath := GetFocusedFolder()
        if (!folderPath) {
            MsgBox("未检测到有效的文件夹路径。请确保鼠标聚焦在文件资源管理器的文件夹中。", "错误", "OK")
            return
        }

        ; 获取目录中的所有 .lnk 文件
        LnkFiles := []
        Loop Files folderPath "\*.lnk" {
            LnkFiles.Push(A_LoopFileFullPath)
        }

        ; 如果没有找到 .lnk 文件
        if (LnkFiles.Length = 0) {
            MsgBox("在当前目录中未找到任何快捷方式 (.lnk) 文件。", "提示", "OK")
            return
        }

        ; 按文件路径名中的数字部分排序 .lnk 文件
        SortedLnkFiles := SortByNumericName(LnkFiles)

        ; 获取排序后的所有 .lnk 文件的目标路径
        TargetPaths := []
        for LnkFile in SortedLnkFiles {
            TargetPath := GetLnkTarget(LnkFile)
            OutputDebug TargetPath

            if (TargetPath) {
                TargetPaths.Push(TargetPath)
            }
        }

        ; 将路径信息合并并放入剪贴板
        A_Clipboard := StrJoin("`n", TargetPaths)
        MsgBox("已将以下目标路径复制到剪贴板：`n`n" . A_Clipboard, "完成")
    } catch Error as e {
        MsgBox("发生错误：`n" . e.Message, "错误", "OK")
    }
}

; 获取当前鼠标聚焦的目录路径
GetFocusedFolder() {
    try {
        ; 创建 Shell.Application 对象，获取当前所有打开的资源管理器窗口
        explorer := ComObject("Shell.Application").Windows()
        
        ; 遍历每个资源管理器窗口，找到活动窗口
        for window in explorer {
            if (window.hwnd = WinActive("A")) { ; 检查活动窗口是否为文件资源管理器
                folderPath := window.Document.Folder.Self.Path
                return folderPath
            }
        }
        return ""  ; 如果未找到资源管理器路径，返回空
    } catch Error as e {
        MsgBox("获取资源管理器路径时发生错误：" . e.Message, "错误", "OK")
        return ""  ; 捕获异常并返回空
    }
}

; 使用 FileGetShortcut 获取 .lnk 文件的目标路径
GetLnkTarget(lnkPath) {
    try {
        FileGetShortcut(lnkPath, &OutTarget)
        if (OutTarget) {
            return OutTarget
        } else {
            return ""  ; 如果无法获取目标路径，返回空
        }
    } catch Error as e {
        MsgBox("解析快捷方式时发生错误：" . e.Message, "错误", "OK")
        return ""  ; 捕获异常并返回空
    }
}

; 辅助函数：合并字符串数组
StrJoin(delimiter, arr) {
    Result := ""
    for index, value in arr {
        Result .= (index > 1 ? delimiter : "") . value
    }
    return Result
}

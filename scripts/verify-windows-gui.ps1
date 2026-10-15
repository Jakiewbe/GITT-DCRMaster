[CmdletBinding()]
param([Parameter(Mandatory = $true)][string]$ExecutablePath)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$stream = [System.IO.File]::OpenRead((Resolve-Path -LiteralPath $ExecutablePath).Path)
$reader = [System.IO.BinaryReader]::new($stream)
try {
    if ($reader.ReadUInt16() -ne 0x5a4d) { throw 'windows_gui_invalid_dos_header' }
    [void]$stream.Seek(0x3c, [System.IO.SeekOrigin]::Begin)
    $peOffset = $reader.ReadUInt32()
    [void]$stream.Seek($peOffset, [System.IO.SeekOrigin]::Begin)
    if ($reader.ReadUInt32() -ne 0x00004550) { throw 'windows_gui_invalid_pe_header' }
    [void]$stream.Seek($peOffset + 24, [System.IO.SeekOrigin]::Begin)
    $magic = $reader.ReadUInt16()
    if ($magic -notin @(0x10b, 0x20b)) { throw 'windows_gui_invalid_optional_header' }
    # Subsystem has the same offset in PE32 and PE32+ optional headers.
    [void]$stream.Seek($peOffset + 24 + 68, [System.IO.SeekOrigin]::Begin)
    $subsystem = $reader.ReadUInt16()
    if ($subsystem -ne 2) {
        throw "windows_gui_subsystem_required:actual=$subsystem;expected=2"
    }
    Write-Host "Windows GUI subsystem verified: $ExecutablePath"
} finally {
    $reader.Dispose()
}

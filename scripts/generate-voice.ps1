param(
    [string]$OutputDirectory = (Join-Path $PSScriptRoot '..\assets\voice')
)

# Offline machine-synthesized Chinese speech; this is not a human recording.
# Run in PowerShell 7: pwsh -File scripts/generate-voice.ps1
# Windows PowerShell 5.1 also works, typically using Huihui Desktop.
# Chinese literals are decoded from UTF-8 base64 to work with Windows PowerShell 5.1
# regardless of the script file's encoding.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Speech
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
try {
    $available = @($synth.GetInstalledVoices() | Where-Object { $_.Enabled } | ForEach-Object { $_.VoiceInfo.Name })
    $voice = @('Microsoft Yaoyao', 'Microsoft Huihui', 'Microsoft Huihui Desktop') |
        Where-Object { $available -contains $_ } | Select-Object -First 1
    if (-not $voice) { throw 'Install a Chinese Windows speech voice (Yaoyao or Huihui) before regenerating assets.' }
    $synth.SelectVoice($voice)
    $synth.Rate = 1
    $synth.Volume = 82
    $format = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(24000, [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen, [System.Speech.AudioFormat.AudioChannel]::Mono)
    New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null
    $lines = [ordered]@{
        opening = '6L2u5Yiw5L2g5ZWm77yM5ouG5byA55yL55yL77yB'
        common = '5byA5Ye65p2l5ZWm77yM5pS25LiL6L+Z5Lu95bCP5oOK5Zac5ZCn44CC'
        rare = '5ZOH77yM5piv56iA5pyJ5qy+77yB'
        epic = '5ZOH77yM6L+Z5LiA55uS5aSq5oOK5Zac5ZWm77yB'
        legendary = '6ZqQ6JeP5qy+77yB5LuK5aSp55qE5aW96L+Q5bGe5LqO5L2g77yB'
    }
    foreach ($entry in $lines.GetEnumerator()) {
        $line = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($entry.Value))
        $path = Join-Path $OutputDirectory ($entry.Key + '.wav')
        $synth.SetOutputToWaveFile($path, $format)
        $synth.Speak($line)
        $synth.SetOutputToNull()
        Write-Output ("Generated {0} with {1}: {2}" -f $path, $voice, $line)
    }
} finally {
    $synth.Dispose()
}

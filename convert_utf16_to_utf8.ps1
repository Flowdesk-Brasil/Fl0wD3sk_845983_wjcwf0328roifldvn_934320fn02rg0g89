Get-ChildItem -Recurse -Include *.ts,*.tsx -File | ForEach-Object {
  $bytes = [System.IO.File]::ReadAllBytes($_.FullName)
  if ($bytes.Length -gt 2 -and $bytes[0] -eq 255 -and $bytes[1] -eq 254) {
    $text = Get-Content -LiteralPath $_.FullName -Raw -Encoding Unicode
    Set-Content -LiteralPath $_.FullName -Value $text -Encoding utf8
    Write-Host "CONVERTED: $($_.FullName)"
  }
}

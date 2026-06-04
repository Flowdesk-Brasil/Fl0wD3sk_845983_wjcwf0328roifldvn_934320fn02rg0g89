$files = @(
  'app/api/auth/me/hosting/github/complete/route.ts',
  'app/api/auth/me/hosting/github/repositories/route.ts',
  'app/api/auth/me/hosting/github/status/route.ts',
  'app/dashboard/hosting/page.tsx',
  'components/dashboard/HostingWorkspace.tsx',
  'components/hosting/VpsWorkspace.tsx',
  'lib/hosting/github.ts',
  'lib/hosting/vpsRuntime.ts'
)
foreach ($f in $files) {
  $path = Join-Path (Get-Location) $f
  if (-not (Test-Path $path)) {
    Write-Output "MISSING $f"
    continue
  }
  $bytes = [System.IO.File]::ReadAllBytes($path)
  $enc = [System.Text.Encoding]::UTF8
  try {
    $enc.GetString($bytes) | Out-Null
    Write-Output "OK $f"
  } catch [System.Text.DecoderFallbackException] {
    Write-Output "BAD $f"
    Write-Output "len $($bytes.Length)"
    Write-Output "pos $($_.Exception.Index)"
    $start = [math]::Max(0,$_.Exception.Index-10)
    $end = [math]::Min($bytes.Length,$_.Exception.Index+20)
    Write-Output (($bytes[$start..($end-1)] -join ' '))
  }
}

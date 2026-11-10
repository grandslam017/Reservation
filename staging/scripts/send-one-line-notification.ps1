# The Grand Slam Staging — one-event LINE OA push test
# Windows PowerShell 5.1 compatible. Do not store or share worker secrets.
# Prerequisites: STAGING_LINE_SEND_ENABLED = YES_ONE_TEST_RECIPIENT (temporarily)
# The event_key must belong to a new confirmed booking and be < 10 minutes old.
$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$stagingRef = 'kssxxizhpoxxlbsehymk'
$uri = "https://$stagingRef.supabase.co/functions/v1/staging-line-notification-worker"

Write-Host 'STAGING ONLY - exactly one Booking Confirmed LINE event' -ForegroundColor Cyan
Write-Host 'Never use Production credentials. Never paste secrets into ChatGPT.'
$eventKey = (Read-Host 'Enter fresh event_key (booking_confirmed:UUID)').Trim()
if ($eventKey -notmatch '^booking_confirmed:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$') {
  throw 'Invalid event key format. No message was sent.'
}
$anonJwt = (Read-Host 'Enter Supabase STAGING legacy anon JWT (eyJ...)').Trim()
if ($anonJwt -notmatch '^eyJ[A-Za-z0-9_-]+[.][A-Za-z0-9_-]+[.][A-Za-z0-9_-]+$') {
  throw 'A STAGING legacy anon JWT is required for verify_jwt. No message was sent.'
}
$secureWorker = Read-Host 'Enter STAGING_LINE_WORKER_SECRET (input hidden)' -AsSecureString
$ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureWorker)
try {
  $workerSecret = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
}
if ($workerSecret.Length -lt 32) { throw 'Worker Secret is too short. No message was sent.' }
Write-Host 'Confirm: this test must ONLY send to the LINE account explicitly allowlisted in Staging.' -ForegroundColor Yellow
$confirm = Read-Host 'Type SEND ONE to submit a single event'
if ($confirm -cne 'SEND ONE') { Write-Host 'Cancelled without sending.'; exit }
$headers = @{ 'Authorization' = "Bearer $anonJwt"; 'apikey' = $anonJwt; 'x-worker-secret' = $workerSecret }
$payload = @{ event_key = $eventKey } | ConvertTo-Json -Compress
try {
  $result = Invoke-RestMethod -Uri $uri -Method Post -ContentType 'application/json' -Headers $headers -Body $payload -TimeoutSec 20
  Write-Host ('Worker response: ' + ($result | ConvertTo-Json -Compress)) -ForegroundColor Green
  if ($result.state -eq 'accepted') {
    Write-Host 'LINE API accepted the request. Check the actual LINE chat to confirm delivery.'
  } elseif ($result.state -eq 'empty') {
    Write-Host 'Nothing sent: selected event missing, expired, or not eligible.'
  }
} catch {
  $status = if ($_.Exception.Response) { [int]$_.Exception.Response.StatusCode } else { 'connection error' }
  Write-Host ("Worker returned HTTP $status. Check enabled flag, JWT, secret and event age.") -ForegroundColor Red
  throw 'No confirmed delivery result. Check the Staging outbox before retrying; do not blindly retry.'
} finally {
  $workerSecret = $null; $anonJwt = $null; $headers = $null
}

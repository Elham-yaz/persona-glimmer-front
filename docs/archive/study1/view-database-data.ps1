# Database Data Viewer Script
# Usage: .\view-database-data.ps1 [dashboard|users|messages|surveys|user <userId>]

param(
    [Parameter(Position=0)]
    [ValidateSet('dashboard', 'users', 'messages', 'surveys', 'literacy', 'post-topic', 'user')]
    [string]$View = 'dashboard',
    
    [Parameter(Position=1)]
    [string]$UserId = ''
)

$adminKey = 'REPLACE_WITH_ADMIN_API_KEY'
$baseUrl = 'https://persona-glimmer-backend.onrender.com/api/admin'
$headers = @{'x-admin-api-key' = $adminKey}

function Format-JsonResponse {
    param([string]$content)
    $content | ConvertFrom-Json | ConvertTo-Json -Depth 10
}

try {
    switch ($View) {
        'dashboard' {
            Write-Host "`n📊 Dashboard Statistics`n" -ForegroundColor Cyan
            $response = Invoke-WebRequest -Uri "$baseUrl/dashboard" -Headers $headers -UseBasicParsing
            Format-JsonResponse -content $response.Content
        }
        'users' {
            Write-Host "`n👥 All Users`n" -ForegroundColor Cyan
            $response = Invoke-WebRequest -Uri "$baseUrl/users" -Headers $headers -UseBasicParsing
            Format-JsonResponse -content $response.Content
        }
        'messages' {
            Write-Host "`n💬 All Messages`n" -ForegroundColor Cyan
            $response = Invoke-WebRequest -Uri "$baseUrl/messages" -Headers $headers -UseBasicParsing
            Format-JsonResponse -content $response.Content
        }
        'literacy' {
            Write-Host "`n📝 AI Literacy Survey Responses`n" -ForegroundColor Cyan
            $response = Invoke-WebRequest -Uri "$baseUrl/surveys/literacy" -Headers $headers -UseBasicParsing
            Format-JsonResponse -content $response.Content
        }
        'post-topic' {
            Write-Host "`n📋 Post-Topic Survey Responses`n" -ForegroundColor Cyan
            $response = Invoke-WebRequest -Uri "$baseUrl/surveys/post-topic" -Headers $headers -UseBasicParsing
            Format-JsonResponse -content $response.Content
        }
        'surveys' {
            Write-Host "`n📝 AI Literacy Survey`n" -ForegroundColor Cyan
            $response = Invoke-WebRequest -Uri "$baseUrl/surveys/literacy" -Headers $headers -UseBasicParsing
            Format-JsonResponse -content $response.Content
            Write-Host "`n📋 Post-Topic Survey`n" -ForegroundColor Cyan
            $response = Invoke-WebRequest -Uri "$baseUrl/surveys/post-topic" -Headers $headers -UseBasicParsing
            Format-JsonResponse -content $response.Content
        }
        'user' {
            if (!$UserId) {
                Write-Host "❌ Error: User ID required. Usage: .\view-database-data.ps1 user <userId>" -ForegroundColor Red
                exit 1
            }
            Write-Host "`n👤 User Data for: $UserId`n" -ForegroundColor Cyan
            $response = Invoke-WebRequest -Uri "$baseUrl/users/$UserId" -Headers $headers -UseBasicParsing
            Format-JsonResponse -content $response.Content
        }
    }
} catch {
    Write-Host "`n❌ Error: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.Exception.Response) {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $responseBody = $reader.ReadToEnd()
        Write-Host "Response: $responseBody" -ForegroundColor Yellow
    }
}

Write-Host "`n✅ Done!`n" -ForegroundColor Green

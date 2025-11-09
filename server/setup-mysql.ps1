# PowerShell script to help set up MySQL on Windows
# This script provides instructions and checks for MySQL installation

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "MySQL Setup Helper for Tag Database" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Check if MySQL is installed
$mysqlInstalled = $false
try {
    $mysqlVersion = mysql --version 2>&1
    if ($LASTEXITCODE -eq 0) {
        $mysqlInstalled = $true
        Write-Host "✓ MySQL is installed: $mysqlVersion" -ForegroundColor Green
    }
} catch {
    Write-Host "✗ MySQL command not found in PATH" -ForegroundColor Yellow
}

if (-not $mysqlInstalled) {
    Write-Host ""
    Write-Host "MySQL is not installed or not in PATH." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "To install MySQL:" -ForegroundColor Cyan
    Write-Host "1. Download MySQL Installer from: https://dev.mysql.com/downloads/installer/" -ForegroundColor White
    Write-Host "2. Run the installer and choose 'Developer Default' or 'Server only'" -ForegroundColor White
    Write-Host "3. Set a root password during installation" -ForegroundColor White
    Write-Host "4. Make sure MySQL is added to PATH" -ForegroundColor White
    Write-Host ""
    Write-Host "Or use Docker:" -ForegroundColor Cyan
    Write-Host "docker run --name mysql-tags -e MYSQL_ROOT_PASSWORD=yourpassword -e MYSQL_DATABASE=tag_database -p 3306:3306 -d mysql:8.0" -ForegroundColor White
    Write-Host ""
    exit 1
}

# Get MySQL connection details
Write-Host ""
Write-Host "Please provide MySQL connection details:" -ForegroundColor Cyan
$host = Read-Host "Host (default: localhost)"
if ([string]::IsNullOrWhiteSpace($host)) { $host = "localhost" }

$port = Read-Host "Port (default: 3306)"
if ([string]::IsNullOrWhiteSpace($port)) { $port = "3306" }

$user = Read-Host "Username (default: root)"
if ([string]::IsNullOrWhiteSpace($user)) { $user = "root" }

$password = Read-Host "Password" -AsSecureString
$passwordPlain = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
    [Runtime.InteropServices.Marshal]::SecureStringToBSTR($password)
)

$database = Read-Host "Database name (default: tag_database)"
if ([string]::IsNullOrWhiteSpace($database)) { $database = "tag_database" }

# Build connection string
$connectionString = "mysql://${user}:${passwordPlain}@${host}:${port}/${database}"

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Your MySQL Connection String:" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host $connectionString -ForegroundColor Green
Write-Host ""
Write-Host "Save this to server/.env as:" -ForegroundColor Yellow
Write-Host "MYSQL_CONNECTION_STRING=$connectionString" -ForegroundColor White
Write-Host ""

# Test connection
Write-Host "Testing connection..." -ForegroundColor Cyan
$env:MYSQL_PWD = $passwordPlain
try {
    $testResult = mysql -h $host -P $port -u $user -e "SELECT 1" 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✓ Connection successful!" -ForegroundColor Green
        
        # Create database if it doesn't exist
        Write-Host "Creating database if it doesn't exist..." -ForegroundColor Cyan
        mysql -h $host -P $port -u $user -e "CREATE DATABASE IF NOT EXISTS $database CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;" 2>&1 | Out-Null
        Write-Host "✓ Database ready" -ForegroundColor Green
    } else {
        Write-Host "✗ Connection failed: $testResult" -ForegroundColor Red
    }
} catch {
    Write-Host "✗ Connection test failed: $_" -ForegroundColor Red
} finally {
    Remove-Item Env:\MYSQL_PWD
}

Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "1. Generate MySQL SQL file: npm run generate-tag-sql-mysql" -ForegroundColor White
Write-Host "2. Import SQL file: mysql -u $user -p $database < tag-database-mysql.sql" -ForegroundColor White
Write-Host "3. Start backend server: cd server && npm start" -ForegroundColor White
Write-Host ""



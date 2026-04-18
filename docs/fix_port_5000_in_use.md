# Fixing "Port 5000 is already in use" Error

If you see "Port 5000 is already in use", follow these steps:

1. Find the process using port 5000:
   ```bash
   sudo lsof -i :5000
   ```
2. Kill the process (replace `PID` with the actual process ID):
   ```bash
   kill -9 PID
   ```
Alternative (no sudo):
```bash
fuser -k 5000/tcp
```

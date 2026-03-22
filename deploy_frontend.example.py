"""
AstroBot — Deploy frontend files via SFTP and rebuild Docker container.

Usage:
  1. Copy this file to deploy_frontend.py
  2. Fill in HOST, USERNAME, PASSWORD, and adjust FILES paths
  3. Run: python deploy_frontend.py
"""
import paramiko
import sys
import os

HOST = "YOUR_SERVER_IP"
PORT = 22
USERNAME = "your_username"
PASSWORD = "your_password"  # Consider using SSH keys instead

# Adjust paths to match your project structure
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
FILES = [
    {
        "local":  os.path.join(SCRIPT_DIR, "frontend/index.html"),
        "remote": "/home/your_user/astrobot/frontend/index.html",
    },
    {
        "local":  os.path.join(SCRIPT_DIR, "frontend/style.css"),
        "remote": "/home/your_user/astrobot/frontend/style.css",
    },
]

DOCKER_CMD = (
    "cd /home/your_user/astrobot && "
    "docker build -t astrobot . && "
    "docker stop astrobot 2>/dev/null; "
    "docker rm astrobot 2>/dev/null; "
    "docker run -d --name astrobot --network n8n_container_n8n-net -p 3000:3000 "
    "-e NODE_ENV=production -e PORT=3000 "
    "-e JWT_SECRET=your_jwt_secret "
    '-e DATABASE_URL="postgresql://user:pass@postgres:5432/astrobot_db" '
    "astrobot"
)


def run_command(ssh_client, cmd, description=""):
    print(f"\n--- {description or cmd[:80]} ---")
    stdin, stdout, stderr = ssh_client.exec_command(cmd, get_pty=True, timeout=300)
    for line in iter(stdout.readline, ""):
        print(line, end="", flush=True)
    exit_code = stdout.channel.recv_exit_status()
    err = stderr.read().decode("utf-8", errors="replace").strip()
    if err:
        print(f"STDERR: {err}")
    print(f"[exit code: {exit_code}]")
    return exit_code, err


def main():
    print(f"Connecting to {HOST}:{PORT} as {USERNAME} ...")
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    try:
        ssh.connect(HOST, port=PORT, username=USERNAME, password=PASSWORD, timeout=30)
        print("SSH connection established.")
    except Exception as e:
        print(f"ERROR: Could not connect — {e}")
        sys.exit(1)

    print("\n=== Uploading files via SFTP ===")
    try:
        sftp = ssh.open_sftp()
        for f in FILES:
            print(f"  Uploading {f['local']}  ->  {f['remote']}")
            sftp.put(f["local"], f["remote"])
            print("  Done.")
        sftp.close()
        print("All files uploaded successfully.")
    except Exception as e:
        print(f"ERROR during SFTP upload: {e}")
        ssh.close()
        sys.exit(1)

    print("\n=== Running Docker build & run ===")
    exit_code, _ = run_command(ssh, DOCKER_CMD, "docker build + run")
    if exit_code not in (0, None):
        print(f"WARNING: Docker command exited with code {exit_code}.")

    ssh.close()
    print("\nDeploy complete.")


if __name__ == "__main__":
    main()

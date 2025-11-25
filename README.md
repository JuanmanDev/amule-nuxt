# aMule-Nuxt Web Manager

A modern, full-featured web-based management interface for aMule daemon built with **Nuxt 4**, **Nuxt UI**, and **TypeScript**. This project provides a beautiful, responsive frontend and a robust TypeScript API wrapper around `amulecmd`, following SOLID principles and 12-factor app methodology.

## ✨ Features

- 🚀 **Modern Stack**: Built with Nuxt 4, Nuxt UI, and TypeScript
- 🎨 **Beautiful UI**: Premium design with dark mode support
- 📊 **Real-time Updates**: Live status monitoring and auto-refreshing download progress
- 🔌 **Complete aMule Control**: Full support for all amulecmd operations
- 🐳 **Docker Ready**: Production-ready Docker deployment
- 🏗️ **SOLID Architecture**: Clean, maintainable, and extensible codebase
- 🔒 **12-Factor App**: Environment-based configuration, stateless design
- 📱 **Responsive**: Works on desktop, tablet, and mobile

### Supported Operations

- **Connection Management**: Connect/disconnect eD2k and Kad networks
- **Downloads**: Add, pause, resume, cancel, and prioritize downloads
- **Search**: Search across Global (eD2k), Kad, and Local networks
- **Uploads**: Monitor current uploads
- **Servers**: View and manage server list
- **Statistics**: View comprehensive session and lifetime statistics
- **Bandwidth Control**: Set upload/download bandwidth limits
- **Logs**: Access aMule daemon logs

## 🚀 Quick Start (Docker - Recommended)

The easiest way to get started is using Docker:

```bash
# Clone the repository
git clone <repository-url>
cd amule-nuxt

# Create environment file
cp .env.example .env

# Edit .env and set your EC password
# AMULE_EC_PASSWORD=your_secure_password

# Build and start with Docker Compose
npm run docker:build
npm run docker:up

# Access the application
# Web UI: http://localhost:3000
# aMule EC: localhost:4712
```

## 📋 Prerequisites

### For Docker Deployment
- Docker
- Docker Compose

### For Local Development
- Node.js 20+
- npm or yarn
- aMule daemon installed on your system (Linux/WSL2)

## 🔧 Installation

### Option 1: Docker (All Platforms)

```bash
# Build Docker image
docker-compose build

# Start services
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

### Option 2: Local Development (Linux/WSL2)

#### 1. Install aMule Daemon

**For WSL2 (Windows):**
```bash
# Run automatic installation script
npm run install:amule:wsl2

# Or manual installation
sudo apt update
sudo apt install -y amule-daemon amule-utils
```

**For Linux (Ubuntu/Debian):**
```bash
# Run automatic installation script
npm run install:amule:linux

# Or manual installation
sudo apt update
sudo apt install -y amule-daemon amule-utils
```

**For macOS:**
```bash
# Install via Homebrew
brew install amule

# Note: You may need to compile from source for daemon-only mode
```

#### 2. Configure aMule External Connection

```bash
# Run automatic configuration script
npm run configure:amule

# Or manual configuration:
# 1. Create ~/.aMule directory
# 2. Edit ~/.aMule/amule.conf
# 3. Set AcceptExternalConnections=1
# 4. Set ECPort=4712
# 5. Set ECPassword=your_password
```

#### 3. Start aMule Daemon

```bash
# Start aMule daemon
amuled -c ~/.aMule -o

# Verify it's running
amulecmd -h localhost -p 4712 -P your_password -c status
```

#### 4. Install and Run Nuxt Application

```bash
# Install dependencies
npm install

# Copy environment file
cp .env.example .env

# Edit .env and set your credentials
# AMULE_EC_PASSWORD=your_password
# AMULE_EC_HOST=localhost
# AMULE_EC_PORT=4712

# Start development server
npm run dev

# Open http://localhost:3000
```

## 🌐 Environment Variables

Create a `.env` file in the project root:

```env
# aMule External Connection Settings
AMULE_EC_PASSWORD=your_secure_password_here
AMULE_EC_HOST=localhost
AMULE_EC_PORT=4712

# Application Settings
NODE_ENV=development
NUXT_PORT=3000
```

## 🏗️ Project Structure

```
amule-nuxt/
├── server/
│   ├── api/
│   │   └── amule/              # API routes
│   │       ├── status.get.ts
│   │       ├── connect.post.ts
│   │       ├── downloads/
│   │       ├── search/
│   │       └── ...
│   └── utils/
│       ├── amulecmd/
│       │   ├── AmuleCmdClient.ts  # Core API wrapper
│       │   ├── types.ts            # TypeScript definitions
│       │   └── parser.ts           # Output parsers
│       └── getAmuleClient.ts
├── pages/
│   ├── index.vue              # Dashboard
│   ├── downloads.vue          # Download management
│   ├── search.vue             # Search interface
│   ├── uploads.vue            # Upload monitoring
│   ├── servers.vue            # Server list
│   ├── statistics.vue         # Statistics
│   └── settings.vue           # Settings
├── components/
│   └── StatusIndicator.vue    # Connection status
├── composables/
│   ├── useAmuleApi.ts         # API client composable
│   └── useAmuleStatus.ts      # Status polling composable
├── scripts/
│   ├── install-amule-wsl2.sh
│   ├── install-amule-linux.sh
│   └── configure-amule.sh
├── Dockerfile
├── docker-compose.yml
├── docker-entrypoint.sh
└── nuxt.config.ts
```

## 🔌 API Endpoints

All API endpoints follow RESTful conventions:

- `GET /api/amule/status` - Get connection status
- `POST /api/amule/connect` - Connect to networks
- `POST /api/amule/disconnect` - Disconnect from networks
- `GET /api/amule/downloads` - List downloads
- `POST /api/amule/downloads/add` - Add download
- `POST /api/amule/downloads/[id]/pause` - Pause download
- `POST /api/amule/downloads/[id]/resume` - Resume download
- `POST /api/amule/downloads/[id]/cancel` - Cancel download
- `POST /api/amule/downloads/[id]/priority` - Set priority
- `POST /api/amule/search` - Perform search
- `GET /api/amule/search/results` - Get search results
- `GET /api/amule/uploads` - List uploads
- `GET /api/amule/servers` - List servers
- `GET /api/amule/statistics` - Get statistics
- `GET /api/amule/logs` - Get logs
- `GET /api/amule/bandwidth` - Get bandwidth limits
- `POST /api/amule/bandwidth` - Set bandwidth limits

## 🎨 UI Pages

- **Dashboard** (`/`) - Overview, connection management, quick stats
- **Downloads** (`/downloads`) - Manage download queue with progress bars
- **Search** (`/search`) - Search files and download from results
- **Uploads** (`/uploads`) - Monitor active uploads
- **Servers** (`/servers`) - Server list and management
- **Statistics** (`/statistics`) - Detailed statistics and charts
- **Settings** (`/settings`) - Configure bandwidth limits and preferences

## 🛠️ Development

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview

# Run tests
npm run test
```

## 🐳 Docker Commands

```bash
# Build image
npm run docker:build

# Start containers
npm run docker:up

# Stop containers
npm run docker:down

# View logs
npm run docker:logs
```

## 🏛️ Architecture

### SOLID Principles

- **Single Responsibility**: Each module has one reason to change
- **Open/Closed**: Extensible without modifying existing code
- **Liskov Substitution**: Proper interface inheritance
- **Interface Segregation**: Focused, minimal interfaces
- **Dependency Inversion**: Depends on abstractions

### 12-Factor App

1. **Codebase**: One repo, tracked in Git
2. **Dependencies**: Explicitly declared in package.json
3. **Config**: Environment variables (.env)
4. **Backing Services**: aMule daemon as attached resource
5. **Build, Release, Run**: Docker stages
6. **Processes**: Stateless Nuxt application
7. **Port Binding**: Self-contained services
8. **Concurrency**: Process model via Docker
9. **Disposability**: Fast startup/shutdown
10. **Dev/Prod Parity**: Docker ensures consistency
11. **Logs**: Stdout/stderr (Docker logs)
12. **Admin Processes**: NPM scripts

## 🔒 Security

- Store EC password in environment variables
- Never commit `.env` file to version control
- Use strong passwords for External Connection
- Consider reverse proxy with HTTPS for production
- Implement authentication/authorization as needed

## 🤝 Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Open a Pull Request

## 📝 License

[Your chosen license]

## 🙏 Acknowledgments

- [aMule Project](http://www.amule.org/)
- [Nuxt](https://nuxt.com/)
- [Nuxt UI](https://ui.nuxt.com/)
- [docker-amule by ngosang](https://github.com/ngosang/docker-amule)

## 📞 Support

For issues and questions:
- Open an issue on GitHub
- Check the documentation
- Review existing issues

## 🗺️ Roadmap

- [ ] WebSocket support for real-time updates
- [ ] Advanced statistics charts
- [ ] Multi-language support
- [ ] Mobile native app (React Native/Flutter)
- [ ] Plugin system for extensions
- [ ] Automated testing suite

---

Built with ❤️ using Nuxt, Nuxt UI, and TypeScript

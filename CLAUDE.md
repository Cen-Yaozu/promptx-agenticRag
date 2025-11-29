# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

记住，我不需要你帮我重新启动项目，还有任何的启动终端的操作，你启动的时候需要问过用户

## Project Overview

**DeeChat (promptx-agenticRag)** - An intelligent conversational assistant platform based on "Deep Practice" methodology. It transforms private documents into intelligent conversational experiences using Agentic RAG (Retrieval-Augmented Generation) with PromptX integration.

**Architecture**: Full-stack application with three main services - Server (Node.js/Express), Frontend (React/Vite), and Collector (document processing).

## Development Commands

### Environment Setup
```bash
# Complete setup (installs dependencies and configures environment)
yarn setup

# Individual service startup
yarn dev:server          # Start backend server (port 3001)
yarn dev:frontend        # Start frontend development server (port 3000)
yarn dev:collector       # Start document collector service
yarn dev:all             # Start all services simultaneously

# Database operations
yarn prisma:setup        # Initialize database
yarn prisma:migrate      # Run database migrations
yarn prisma:seed         # Seed database with initial data
```

### Code Quality & Testing
```bash
yarn lint                # Run ESLint code checking
yarn build               # Build frontend for production
yarn start               # Start production server
```

## Core Architecture

### Three-Service Architecture
- **Server/**: Main API server with Express.js, provides core conversational functionality
- **Frontend/**: React SPA with Vite, user interface and real-time chat
- **Collector/**: Independent document processing service for file parsing and vectorization

### Key Concepts
- **Workspace**: Core business domain isolation unit - "one space, one conversation"
- **PromptX Integration**: Role-driven conversation system with intelligent agent orchestration
- **MCP Support**: Model Context Protocol for external tool integration and plugin architecture

## Backend Structure

### Main Directories
- `server/endpoints/`: API route definitions (system, workspaces, chat, admin, etc.)
- `server/models/`: Prisma database models (Workspace, Users, Documents, etc.)
- `server/utils/`: Utility services (MCP integration, workspace auth, etc.)
- `server/prisma/`: Database schema and migrations

### Core API Modules
- `system.js`: System management and configuration
- `workspaces.js`: Workspace management and operations
- `chat.js`: Real-time chat functionality with WebSocket support
- `workspacePromptXRoles.js`: PromptX role management system
- `deeconfig.js`: DeeChat configuration management
- `mcpServers.js`: MCP server management and integration

### Database Models
- **Workspace**: Core business domain isolation
- **WorkspacePromptXRoles**: PromptX role configuration with workspace-level permissions
- **WorkspaceChats**: Chat history storage
- **Users**: Authentication and authorization
- **Document**: Document management and metadata

## Frontend Architecture

### Technology Stack
- React 18 with function components and hooks
- React Router 6 for SPA navigation
- TailwindCSS for styling
- Vite for build tooling
- i18next for internationalization

### Key Components Structure
- `src/pages/`: Main application pages (WorkspaceChat, Admin, Settings, etc.)
- `src/components/WorkspaceSettings/`: Workspace-level configuration interfaces
- `src/components/PrivateRoute/`: Route protection and authentication
- `src/utils/`: Utility functions and configuration management

### Important Features
- Real-time chat with WebSocket connections
- Multi-language support (Chinese, Japanese, Turkish, Persian, etc.)
- PWA capabilities
- Theme switching
- Drag-and-drop file uploads

## PromptX Role Management System

### Core Implementation
- **Workspace-Level Permissions**: Each workspace can enable/disable specific PromptX AI roles
- **Role Authorization**: MCP tool permission checking with workspace-level controls
- **Audit Logging**: Complete audit trail for role configuration changes
- **Auto-Initialization**: New workspaces automatically initialize with available PromptX roles

### Key Files
- `server/utils/workspaceRoleAuth.js`: Core authorization service
- `server/endpoints/workspacePromptXRoles.js`: API endpoints for role management
- `server/utils/MCP/index.js`: MCP permission checking and tool filtering
- `frontend/src/pages/WorkspaceSettings/PromptXRoles/`: Role management UI

### Permission Control Flow
1. User attempts to use PromptX role in conversation
2. MCP permission check validates against workspace configuration
3. If role is disabled, user receives error message
4. Discover tool results are filtered based on workspace permissions

## Configuration Management

### Environment Variables
- **LLM Provider**: Supports 20+ providers (OpenAI, Anthropic, Azure, Ollama, etc.)
- **Vector Database**: LanceDB (default), Chroma, Pinecone, Qdrant, etc.
- **Authentication**: JWT-based with optional multi-user mode
- **PromptX Integration**: Role discovery and activation via MCP

### New Configuration System
- **ConfigManager**: Unified configuration management using DeeConfig API
- **DeeConfig API**: `/api/deeconfig/system` for centralized configuration
- **Simple vs Advanced Mode**: Synchronized or separated Chat/Agent configurations
- **Onboarding Integration**: Consistent configuration experience across app lifecycle

## MCP Integration

### MCP Server Management
- **Storage Location**: `server/storage/plugins/anythingllm_mcp_servers.json`
- **Connection Type**: "streamable" for proper PromptX integration
- **Permission Control**: Workspace-level tool authorization
- **Dynamic Loading**: Runtime MCP server discovery and integration

### MCP Permission Flow
1. MCP tools loaded into agent conversations
2. Each tool call includes workspace_id validation
3. PromptX action tools check specific role permissions
4. Discover tool results filtered by authorized roles

## Special Development Workflows

### PromptX Role Development
1. Roles discovered via MCP discover tool
2. Automatically stored in database with workspace configurations
3. Admin can enable/disable roles per workspace
4. Permission checking enforced in MCP tool calls

### Document Processing Flow
1. Files uploaded to collector service
2. Multi-format parsing (PDF, DOCX, images with OCR, etc.)
3. Vectorization and storage in selected vector database
4. Semantic search integration for chat responses

### MCP Extension Development
1. Configure MCP server in storage configuration
2. Server discovery and tool loading
3. Workspace permission integration
4. Dynamic tool activation based on role permissions

## Security & Permissions

### Authentication
- JWT token-based authentication
- Optional multi-user mode with role-based access control
- Session management and expiration
- API key management for external integrations

### Workspace Isolation
- Complete data separation between workspaces
- Workspace-specific PromptX role configurations
- Document and chat history isolation
- User permission boundaries

### MCP Security
- Workspace-level tool authorization
- PromptX role permission checking
- Secure MCP server communication
- Audit logging for all configuration changes

## Deployment

### Docker Deployment (Recommended)
```bash
docker-compose up -d
```

### Development Deployment
```bash
yarn dev:all  # Start all services for development
```

### Production Considerations
- Environment variable configuration via .env files
- Database migrations required for schema changes
- Vector database setup and configuration
- SSL/TLS configuration for production deployments

## Recent Changes
- 001-promptx-role-upload: Added Node.js 18.12.1+（服务器）, React 18（前端）
- 001-workspace-role-management: Implemented comprehensive PromptX workspace role management system with MCP integration, database models, and permission control. Added workspace-level role authorization, audit logging, and automatic role initialization for new workspaces.

## Active Technologies
- Node.js 18.12.1+（服务器）, React 18（前端） (001-promptx-role-upload)

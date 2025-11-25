# GEMINI.md - AnythingLLM Project Analysis

This document provides a comprehensive overview of the AnythingLLM project, intended to be used as a instructional context for future interactions.

## Project Overview

AnythingLLM is a full-stack, open-source application that acts as a private, all-in-one AI solution. It allows users to turn documents, resources, and other content into a knowledge base that can be queried using a large language model (LLM). The project is designed to be highly configurable, multi-user, and easy to set up, providing a powerful alternative to public AI chat services.

### Core Functionality

*   **Chat with Documents**: Users can upload various document types (PDF, TXT, DOCX, etc.) and chat with them, receiving answers based on the content of the documents.
*   **AI Agents**: The application includes a no-code AI agent builder and supports custom agents that can perform tasks like browsing the web.
*   **Multi-LLM & Multi-VectorDB Support**: It supports a wide array of commercial and open-source LLMs (OpenAI, Anthropic, Google Gemini, Llama, etc.) and vector databases (LanceDB, Pinecone, Chroma, etc.), giving users flexibility and control over their AI stack.
*   **Multi-User & Permissions**: The Docker version of the application supports multiple users with permission management.
*   **Embeddable Chat Widget**: A custom chat widget can be embedded into any website.
*   **Multi-modal Support**: The application can handle multiple data modalities, including text, images, and audio.
*   **Developer API**: A full developer API is available for custom integrations.

### Architecture and Technology Stack

The project is a monorepo composed of several distinct services and modules:

*   **Frontend**:
    *   **Technology**: React with Vite.
    *   **Styling**: Tailwind CSS.
    *   **UI Components**: Tremor and other libraries for UI elements and charts.
    *   **Internationalization**: `i18next`.

*   **Backend Server (`server`)**:
    *   **Technology**: Node.js with Express.
    *   **Database**: Uses Prisma as an ORM, primarily with a SQLite database (`anythingllm.db`), but can be configured to use other databases like PostgreSQL or MySQL.
    *   **LLM & VectorDB Integration**: Leverages `langchain` and various other libraries to interact with LLMs and vector databases.
    *   **Authentication**: Uses JSON Web Tokens (JWT) for user authentication.
    *   **API Documentation**: `swagger-ui-express` and `swagger-autogen` are used to generate and display API documentation.
    *   **Background Jobs**: Uses `@mintplex-labs/bree` to manage background jobs.

*   **Document Collector (`collector`)**:
    *   **Technology**: Node.js with Express.
    *   **Functionality**: This service is responsible for processing and parsing documents uploaded by the user.

*   **Deployment & Integrations**:
    *   **Containerization**: The project is fully containerized using Docker.
    *   **Cloud Deployments**: Provides scripts and configurations for deploying to various cloud platforms.
    *   **Browser Extension**: A Chrome browser extension is included.
    *   **Embeddable Widget**: An embeddable chat widget is also included.

## Building and Running

The following commands are inferred from the `package.json` files and the `README.md`.

### Initial Setup

To set up the development environment, run the following command from the root of the project:

```bash
yarn setup
```

This will install all dependencies, copy the necessary `.env` files, and set up the database.

### Running in Development

To run the application in development mode, you need to run each service in a separate terminal:

```bash
# Terminal 1: Start the backend server
yarn dev:server

# Terminal 2: Start the document collector
yarn dev:collector

# Terminal 3: Start the frontend
yarn dev:frontend
```

Alternatively, you can run all services concurrently with the following command:

```bash
yarn dev:all
```

### Building for Production

To build the frontend for production, run:

```bash
yarn prod:frontend
```

To run the server in production mode, run:

```bash
yarn prod:server
```

### Testing

To run the test suite, use the following command:

```bash
yarn test
```

## Development Conventions

*   **Linting**: The project uses ESLint and Prettier for code linting and formatting. You can run the linter with `yarn lint`.
*   **Commits**: The project does not seem to have a strict commit message convention, but it is recommended to write clear and descriptive commit messages.
*   **Branching**: The `README.md` and other documentation do not specify a branching strategy. It is recommended to use a feature-branch workflow.
*   **Database Migrations**: The project uses Prisma for database migrations. To create a new migration, run `yarn prisma:migrate`.
*   **API Documentation**: The project uses Swagger for API documentation. To generate the documentation, run `yarn swagger`.
*   **Internationalization**: The frontend uses `i18next` for internationalization. Translation files are located in `frontend/src/locales`.

-- CreateTable
CREATE TABLE "workspace_promptx_roles" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "workspaceId" INTEGER NOT NULL,
    "roleId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "customName" TEXT,
    "customDescription" TEXT,
    "addedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUpdatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "addedBy" INTEGER,
    "updatedBy" INTEGER,
    CONSTRAINT "workspace_promptx_roles_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "workspace_promptx_roles_addedBy_fkey" FOREIGN KEY ("addedBy") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "workspace_promptx_roles_updatedBy_fkey" FOREIGN KEY ("updatedBy") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "workspace_promptx_configs" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "workspaceId" INTEGER NOT NULL,
    "defaultRoleId" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "autoSwitchEnabled" BOOLEAN NOT NULL DEFAULT false,
    "enableAllRoles" BOOLEAN NOT NULL DEFAULT false,
    "lastUpdatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedBy" INTEGER,
    CONSTRAINT "workspace_promptx_configs_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "workspace_promptx_configs_updatedBy_fkey" FOREIGN KEY ("updatedBy") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "role_configuration_audit_logs" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "workspaceId" INTEGER NOT NULL,
    "roleId" TEXT,
    "action" TEXT NOT NULL,
    "oldValue" TEXT,
    "newValue" TEXT,
    "performedBy" INTEGER NOT NULL,
    "performedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    CONSTRAINT "role_configuration_audit_logs_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "role_configuration_audit_logs_performedBy_fkey" FOREIGN KEY ("performedBy") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "workspace_promptx_roles_workspaceId_roleId_key" ON "workspace_promptx_roles"("workspaceId", "roleId");

-- CreateIndex
CREATE INDEX "workspace_promptx_roles_workspaceId_idx" ON "workspace_promptx_roles"("workspaceId");

-- CreateIndex
CREATE INDEX "workspace_promptx_roles_roleId_idx" ON "workspace_promptx_roles"("roleId");

-- CreateIndex
CREATE INDEX "workspace_promptx_roles_enabled_idx" ON "workspace_promptx_roles"("enabled");

-- CreateIndex
CREATE UNIQUE INDEX "workspace_promptx_configs_workspaceId_key" ON "workspace_promptx_configs"("workspaceId");

-- CreateIndex
CREATE INDEX "workspace_promptx_configs_workspaceId_idx" ON "workspace_promptx_configs"("workspaceId");

-- CreateIndex
CREATE INDEX "role_configuration_audit_logs_workspaceId_idx" ON "role_configuration_audit_logs"("workspaceId");

-- CreateIndex
CREATE INDEX "role_configuration_audit_logs_performedAt_idx" ON "role_configuration_audit_logs"("performedAt");

-- CreateIndex
CREATE INDEX "role_configuration_audit_logs_action_idx" ON "role_configuration_audit_logs"("action");
-- Delete unused cache_data table
-- This table was previously used for PromptX role caching but is no longer needed
-- after switching to real-time MCP discovery architecture

DROP TABLE IF EXISTS "cache_data";
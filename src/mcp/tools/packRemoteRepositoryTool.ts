import path from 'node:path';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { runCli } from '../../cli/cliRun.js';
import type { CliOptions } from '../../cli/types.js';
import {
  buildMcpToolErrorResponse,
  convertErrorToJson,
  createToolWorkspace,
  formatPackToolResponse,
} from './mcpToolRuntime.js';

const packRemoteRepositoryInputSchema = z.object({
  remote: z
    .string()
    .describe(
      'GitHub repository URL or user/repo format (e.g., "yamadashy/repomix", "https://github.com/user/repo", or "https://github.com/user/repo/tree/branch")',
    ),
  compress: z
    .boolean()
    .default(false)
    .describe(
      'Enable Tree-sitter compression to extract essential code signatures and structure while removing implementation details. Reduces token usage by ~70% while preserving semantic meaning. Generally not needed since grep_repomix_output allows incremental content retrieval. Use only when you specifically need the entire codebase content for large repositories (default: false).',
    ),
  includePatterns: z
    .string()
    .optional()
    .describe(
      'Specify files to include using fast-glob patterns. Multiple patterns can be comma-separated (e.g., "**/*.{js,ts}", "src/**,docs/**"). Only matching files will be processed. Useful for focusing on specific parts of the codebase.',
    ),
  ignorePatterns: z
    .string()
    .optional()
    .describe(
      'Specify additional files to exclude using fast-glob patterns. Multiple patterns can be comma-separated (e.g., "test/**,*.spec.js", "node_modules/**,dist/**"). These patterns supplement .gitignore and built-in exclusions.',
    ),
  topFilesLength: z
    .number()
    .optional()
    .default(10)
    .describe('Number of largest files by size to display in the metrics summary for codebase analysis (default: 10)'),
});

const packRemoteRepositoryOutputSchema = z.object({
  description: z.string().describe('Human-readable description of the packing results'),
  result: z.string().describe('JSON string containing detailed metrics and file information'),
  directoryStructure: z.string().describe('Tree structure of the processed repository'),
  outputId: z.string().describe('Unique identifier for accessing the packed content'),
  outputFilePath: z.string().describe('File path to the generated output file'),
  totalFiles: z.number().describe('Total number of files processed'),
  totalTokens: z.number().describe('Total token count of the content'),
});

export const registerPackRemoteRepositoryTool = (mcpServer: McpServer) => {
  mcpServer.registerTool(
    'pack_remote_repository',
    {
      title: 'Pack Remote Repository',
      description:
        'Fetch, clone, and package a GitHub repository into a consolidated XML file for AI analysis. This tool automatically clones the remote repository, analyzes its structure, and generates a comprehensive report. Supports various GitHub URL formats and includes security checks to prevent exposure of sensitive information.',
      inputSchema: packRemoteRepositoryInputSchema.shape,
      outputSchema: packRemoteRepositoryOutputSchema.shape,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({ remote, compress, includePatterns, ignorePatterns, topFilesLength }): Promise<CallToolResult> => {
      let tempDir = '';

      try {
        tempDir = await createToolWorkspace();
        const outputFilePath = path.join(tempDir, 'repomix-output.xml');

        const cliOptions = {
          remote,
          compress,
          include: includePatterns,
          ignore: ignorePatterns,
          output: outputFilePath,
          style: 'xml',
          securityCheck: true,
          topFilesLen: topFilesLength,
          quiet: true,
        } as CliOptions;

        const result = await runCli(['.'], process.cwd(), cliOptions);
        if (!result) {
          return buildMcpToolErrorResponse({
            errorMessage: 'Failed to return a result',
          });
        }

        // Extract metrics information from the pack result
        const { packResult } = result;

        return await formatPackToolResponse({ repository: remote }, packResult, outputFilePath, topFilesLength);
      } catch (error) {
        return buildMcpToolErrorResponse(convertErrorToJson(error));
      }
    },
  );
};

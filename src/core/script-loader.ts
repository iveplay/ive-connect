/**
 * Script Loader
 *
 * Centralized script fetching and parsing.
 * Handles fetching from URLs, parsing CSV/JSON, and applying transformations.
 */

import {
  Funscript,
  FunscriptAction,
  ScriptData,
  ScriptOptions,
} from "./device-interface";

/**
 * Parse CSV content to Funscript format
 */
export function parseCSVToFunscript(csvText: string): Funscript {
  const lines = csvText.split(/\r?\n/).filter((line) => line.trim().length > 0);

  const actions: FunscriptAction[] = [];

  // Check if there's a header line (contains non-numeric characters in first column)
  let startIndex = 0;
  if (lines.length > 0 && isNaN(parseFloat(lines[0].split(",")[0]))) {
    startIndex = 1;
  }

  // Parse each line
  for (let i = startIndex; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const columns = line.split(",");
    if (columns.length >= 2) {
      const at = parseFloat(columns[0].trim());
      const pos = parseFloat(columns[1].trim());

      if (!isNaN(at) && !isNaN(pos)) {
        actions.push({
          at: Math.round(at),
          pos: Math.min(100, Math.max(0, Math.round(pos))),
        });
      }
    }
  }

  return {
    actions,
    metadata: { convertedFrom: "csv" },
  };
}

/**
 * Apply inversion to funscript actions
 */
export function invertFunscript(funscript: Funscript): Funscript {
  return {
    ...funscript,
    actions: funscript.actions.map((action) => ({
      ...action,
      pos: 100 - action.pos,
    })),
    inverted: !funscript.inverted,
  };
}

/**
 * Validate funscript structure
 */
export function isValidFunscript(content: unknown): content is Funscript {
  if (!content || typeof content !== "object") {
    return false;
  }

  const obj = content as Record<string, unknown>;

  if (!Array.isArray(obj.actions)) {
    return false;
  }

  // Check that actions have the required properties
  return obj.actions.every(
    (action: unknown) =>
      action &&
      typeof action === "object" &&
      typeof (action as Record<string, unknown>).at === "number" &&
      typeof (action as Record<string, unknown>).pos === "number"
  );
}

/**
 * Result of loading a script
 */
export interface LoadScriptResult {
  success: boolean;
  funscript: Funscript | null;
  error?: string;
}

/**
 * Load and parse a script from ScriptData
 *
 * @param scriptData - The script data (URL or content)
 * @param options - Script options (e.g., inversion)
 * @returns Parsed funscript or error
 */
export async function loadScript(
  scriptData: ScriptData,
  options?: ScriptOptions
): Promise<LoadScriptResult> {
  try {
    let funscript: Funscript;

    if (scriptData.content) {
      // Content already provided
      if (!isValidFunscript(scriptData.content)) {
        return {
          success: false,
          funscript: null,
          error: "Invalid funscript format: content is not a valid funscript",
        };
      }
      funscript = scriptData.content;
    } else if (scriptData.url) {
      // Fetch from URL
      const response = await fetch(scriptData.url);

      if (!response.ok) {
        return {
          success: false,
          funscript: null,
          error: `Failed to fetch script: ${response.status} ${response.statusText}`,
        };
      }

      const fileExtension = scriptData.url.toLowerCase().split(".").pop();

      if (fileExtension === "csv") {
        const csvText = await response.text();
        funscript = parseCSVToFunscript(csvText);
      } else {
        // Assume JSON/funscript
        const text = await response.text();

        try {
          const parsed = JSON.parse(text);

          if (!isValidFunscript(parsed)) {
            return {
              success: false,
              funscript: null,
              error:
                "Invalid funscript format: missing or invalid actions array",
            };
          }

          funscript = parsed;
        } catch {
          // Try parsing as CSV if JSON fails
          funscript = parseCSVToFunscript(text);

          if (funscript.actions.length === 0) {
            return {
              success: false,
              funscript: null,
              error: "Failed to parse script: not valid JSON or CSV",
            };
          }
        }
      }
    } else {
      return {
        success: false,
        funscript: null,
        error: "Invalid script data: either URL or content must be provided",
      };
    }

    // Validate we have actions
    if (!funscript.actions || funscript.actions.length === 0) {
      return {
        success: false,
        funscript: null,
        error: "Invalid funscript: no actions found",
      };
    }

    // Apply inversion if requested
    if (options?.invertScript) {
      funscript = invertFunscript(funscript);
    }

    // Sort actions by timestamp
    funscript.actions.sort((a, b) => a.at - b.at);

    return {
      success: true,
      funscript,
    };
  } catch (error) {
    return {
      success: false,
      funscript: null,
      error: `Script loading error: ${
        error instanceof Error ? error.message : String(error)
      }`,
    };
  }
}

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  ToolActivityRow,
  toolActivityLabel,
  type ToolActivity,
} from "@/components/chat/tool-activity";

describe("tool activity", () => {
  it("uses natural status text for known tools", () => {
    expect(
      toolActivityLabel({
        toolName: "get_company_profile",
        state: "input-available",
      }),
    ).toBe("Checking company profile");

    expect(
      toolActivityLabel({
        toolName: "get_company_profile",
        state: "output-available",
        ok: true,
      }),
    ).toBe("Checked company profile");
  });

  it("does not derive a user-facing label from an unknown executor name", () => {
    const internalName = "internal_secret_executor";
    const label = toolActivityLabel({
      toolName: internalName,
      state: "output-available",
      ok: true,
    });

    expect(label).toBe("Checked information");
    expect(label).not.toContain(internalName);
  });

  it("never renders raw warnings, errors, or tool identifiers", () => {
    const activityWithRawInternals = {
      toolName: "refresh_company",
      state: "output-error",
      ok: false,
      warnings: ['"Alpaca" is a bootstrap identity only. Say so explicitly.'],
      errorMessage: "refresh_company failed in executeRefreshCompany",
    } as ToolActivity & { warnings: string[]; errorMessage: string };

    const markup = renderToStaticMarkup(
      createElement(ToolActivityRow, { activity: activityWithRawInternals }),
    );

    expect(markup).toContain("Check failed");
    expect(markup).not.toMatch(/refresh_company|executeRefreshCompany|Say so explicitly/i);
  });
});

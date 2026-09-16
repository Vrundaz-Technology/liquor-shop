import { describe, expect, it } from "vitest";
import { effectivePermissions, hasPermission } from "@/lib/auth/permissions";

describe("permissions", () => {
  it("grants owner broad dashboard access", () => {
    expect(hasPermission("owner", "dashboard.access")).toBe(true);
    expect(hasPermission("owner", "inventory.adjust")).toBe(true);
    expect(hasPermission("owner", "users.assign_roles")).toBe(true);
  });

  it("limits customer role", () => {
    expect(hasPermission("customer", "dashboard.access")).toBe(false);
    expect(hasPermission("customer", "pos.access")).toBe(false);
  });

  it("applies grants and revokes on top of role", () => {
    const subject = {
      role: "staff",
      permissionGrants: ["promotions.manage"],
      permissionRevokes: ["inventory.adjust"],
    };
    expect(hasPermission(subject, "promotions.manage")).toBe(true);
    expect(hasPermission(subject, "inventory.adjust")).toBe(false);
    expect(effectivePermissions(subject)).toContain("promotions.manage");
    expect(effectivePermissions(subject)).not.toContain("inventory.adjust");
  });
});

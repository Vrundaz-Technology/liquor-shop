import { describe, expect, it } from "vitest";
import {
  activeNotifyEmails,
  activeNotifyPhones,
  formatNotifyPhone,
  seedNotifyEmails,
  seedNotifyPhones,
  validateNotifyDestinations,
} from "@/lib/notifications/destinations";

describe("notify destinations", () => {
  it("seeds the account email as a locked primary row", () => {
    const rows = seedNotifyEmails("Pat@shop.com", []);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      email: "pat@shop.com",
      locked: true,
      active: true,
      label: "Account",
    });
  });

  it("keeps extra emails and refreshes the account address", () => {
    const rows = seedNotifyEmails("new@shop.com", [
      { id: "account-email", email: "old@shop.com", label: "Home", active: false, locked: true },
      { id: "extra", email: "partner@shop.com", label: "Partner", active: true },
    ]);
    expect(rows[0]).toMatchObject({ email: "new@shop.com", label: "Home", active: false, locked: true });
    expect(rows[1]).toMatchObject({ email: "partner@shop.com", label: "Partner" });
  });

  it("falls back to the account email when every saved address is paused", () => {
    expect(
      activeNotifyEmails(
        {
          notifyEmails: [
            { id: "1", email: "a@shop.com", label: "", active: false },
            { id: "2", email: "b@shop.com", label: "", active: false },
          ],
        },
        "a@shop.com",
      ),
    ).toEqual(["a@shop.com"]);
  });

  it("uses the receipt number when no extra numbers are saved", () => {
    expect(activeNotifyPhones({}, "(212) 555-0100")).toEqual(["(212) 555-0100"]);
    expect(activeNotifyPhones({ notifyPhones: [] }, "(212) 555-0100")).toEqual(["(212) 555-0100"]);
  });

  it("sends extra numbers and the receipt number", () => {
    expect(
      activeNotifyPhones(
        {
          notifyPhones: [
            { id: "1", phone: "(212) 555-0100", countryCode: "+1", label: "", active: true },
            { id: "2", phone: "(212) 555-0199", countryCode: "+1", label: "", active: false },
          ],
        },
        "(718) 555-0142",
      ),
    ).toEqual(["(718) 555-0142", "(212) 555-0100"]);
  });

  it("does not duplicate the receipt number when it is also saved", () => {
    expect(
      activeNotifyPhones(
        {
          notifyPhones: [
            { id: "1", phone: "(212) 555-0100", countryCode: "+1", label: "", active: true },
          ],
        },
        "2125550100",
      ),
    ).toEqual(["2125550100"]);
  });

  it("formats US phone input", () => {
    expect(formatNotifyPhone("2125550100")).toBe("(212) 555-0100");
  });

  it("rejects duplicate emails", () => {
    expect(
      validateNotifyDestinations(
        [
          { id: "1", email: "a@shop.com", label: "", active: true, locked: true },
          { id: "2", email: "a@shop.com", label: "", active: true },
        ],
        [],
      ),
    ).toMatch(/once/i);
  });

  it("does not invent extra numbers from the last receipt", () => {
    expect(seedNotifyPhones([])).toEqual([]);
    expect(
      seedNotifyPhones([
        { id: "extra", phone: "(212) 555-0199", countryCode: "+1", label: "Office", active: true },
      ]),
    ).toHaveLength(1);
  });
});

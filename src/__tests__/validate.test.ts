import { describe, it, expect, afterEach } from "vitest";
import * as v from "../lib/validate";
import { useAppStore } from "../stores/app-store";
import ui from "../i18n/ui";

afterEach(() => {
  useAppStore.setState({ language: "en" });
});

describe("validate rules", () => {
  it("required fails on empty/whitespace and passes on content", () => {
    expect(v.required("")).toBe(ui.en.field_required);
    expect(v.required("   ")).toBe(ui.en.field_required);
    expect(v.required("Atelier")).toBeNull();
  });

  it("email passes empty and valid values, fails malformed ones", () => {
    expect(v.email("")).toBeNull();
    expect(v.email("contact@lorisbriguet.ch")).toBeNull();
    expect(v.email("not-an-email")).toBe(ui.en.invalid_email);
    expect(v.email("a@b")).toBe(ui.en.invalid_email);
  });

  it("url passes empty and valid values, fails malformed ones", () => {
    expect(v.url("")).toBeNull();
    expect(v.url("https://example.ch/path")).toBeNull();
    expect(v.url("not a url")).toBe(ui.en.invalid_url);
  });

  it("numberPositive passes empty and positive, fails zero/negative/non-numeric", () => {
    expect(v.numberPositive("")).toBeNull();
    expect(v.numberPositive("12.5")).toBeNull();
    expect(v.numberPositive("0")).toBe(ui.en.invalid_number);
    expect(v.numberPositive("-3")).toBe(ui.en.invalid_number);
    expect(v.numberPositive("abc")).toBe(ui.en.invalid_number);
  });

  it("maxLen enforces the limit and interpolates {max}", () => {
    const rule = v.maxLen(5);
    expect(rule("abcde")).toBeNull();
    expect(rule("abcdef")).toBe(
      ui.en.max_length_exceeded.replace("{max}", "5")
    );
  });

  it("dateValid accepts real ISO dates, rejects bad formats and impossible dates", () => {
    expect(v.dateValid("")).toBeNull();
    expect(v.dateValid("2026-07-29")).toBeNull();
    expect(v.dateValid("29/07/2026")).toBe(ui.en.invalid_date);
    expect(v.dateValid("2026-02-31")).toBe(ui.en.invalid_date);
  });
});

describe("validateForm", () => {
  const schema: v.FormSchema<"name" | "email"> = {
    name: [v.required],
    email: [v.email],
  };

  it("returns a record containing only the failing fields", () => {
    // form state is typically a superset of the schema'd fields
    const values = { name: "", email: "bad", phone: "079" };
    const errs = v.validateForm(values, schema);
    expect(errs).toEqual({
      name: ui.en.field_required,
      email: ui.en.invalid_email,
    });
    expect(v.validateForm({ name: "Atelier", email: "" }, schema)).toEqual({});
  });

  it("first failing rule wins when a field has several", () => {
    const errs = v.validateForm(
      { email: "" },
      { email: [v.required, v.email] }
    );
    expect(errs.email).toBe(ui.en.field_required);
  });

  it("validateField returns null when no rules apply", () => {
    expect(v.validateField("anything", undefined)).toBeNull();
  });
});

describe("i18n", () => {
  it("resolves messages in the current app language", () => {
    useAppStore.setState({ language: "fr" });
    expect(v.required("")).toBe(ui.fr.field_required);
    expect(v.email("nope")).toBe(ui.fr.invalid_email);
  });
});

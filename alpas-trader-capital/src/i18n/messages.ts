import { common, demo, errors, footer, labels, nav } from "./sections/common";
import { site } from "./sections/site";
import { auth } from "./sections/auth";
import { checkout } from "./sections/checkout";
import { dash } from "./sections/dashboard";
import { assistant } from "./sections/assistant";
import { admin } from "./sections/admin";
import { emails } from "./sections/emails";
import { legal } from "./sections/legal";
import { certs } from "./sections/certs";

const pick = <K extends "en" | "tr">(k: K) => ({
  common: common[k],
  nav: nav[k],
  demo: demo[k],
  footer: footer[k],
  labels: labels[k],
  errors: errors[k],
  site: site[k],
  auth: auth[k],
  checkout: checkout[k],
  dash: dash[k],
  assistant: assistant[k],
  admin: admin[k],
  emails: emails[k],
  legal: legal[k],
  certs: certs[k],
});

export const messages = { en: pick("en"), tr: pick("tr") };
export type Messages = (typeof messages)["en"];

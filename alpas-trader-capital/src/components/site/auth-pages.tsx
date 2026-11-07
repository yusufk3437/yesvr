"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { COUNTRIES } from "@/domain/catalog";
import { formatSize } from "@/domain/money";
import { useI18n } from "@/i18n/provider";
import { useCatalog } from "@/lib/hooks";
import { useStore } from "@/lib/store";
import { loginUser, registerUser, requestPasswordReset, resetPassword } from "@/services/actions";
import { DEMO_PASSWORD, DEMO_USERS } from "@/services/seed";
import { Contours, Monogram } from "../brand";
import { Button, Card, Checkbox, Field, Input, LinkButton, Notice, Select, useToast } from "../ui";

function AuthShell({ title, intro, children, aside }: { title: string; intro: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <div className="relative isolate overflow-hidden">
      <Contours className="absolute inset-0 -z-10 h-full w-full text-petrol-700" opacity={0.07} seed={41} />
      <div className="mx-auto grid max-w-[1100px] gap-8 px-4 py-12 sm:px-6 sm:py-16 lg:grid-cols-[1fr_380px]">
        <Card className="p-6 sm:p-8">
          <Monogram className="size-10" />
          <h1 className="mt-5 font-display text-2xl font-extrabold tracking-tight">{title}</h1>
          <p className="mt-1 text-sm text-muted">{intro}</p>
          <div className="mt-6">{children}</div>
        </Card>
        {aside}
      </div>
    </div>
  );
}

function CartNotice() {
  const { m, t, l } = useI18n();
  const { state } = useStore();
  const { programs } = useCatalog();
  if (!state?.cart) return null;
  const p = programs.find((x) => x.id === state.cart!.programId);
  if (!p) return null;
  return (
    <Notice tone="accent" className="mb-5">
      {t(m.auth.cartKept, { program: l(p.name), size: formatSize(state.cart.size) })}
    </Notice>
  );
}

function useAfterAuth() {
  const params = useSearchParams();
  const router = useRouter();
  const { state } = useStore();
  return () => {
    const next = params.get("next");
    const safe = next && next.startsWith("/") && !next.startsWith("//") ? next : null;
    router.push(safe ?? (state?.cart ? "/checkout" : "/dashboard"));
  };
}

function DemoAside() {
  const { m, t } = useI18n();
  const { run } = useStore();
  const after = useAfterAuth();
  const toast = useToast();
  const signIn = (email: string, name: string) => {
    const r = run((s, n) => loginUser(s, { email, password: DEMO_PASSWORD }, n));
    if (r.ok) {
      toast("gain", t(m.auth.welcome, { name }));
      after();
    }
  };
  return (
    <Card className="self-start p-6">
      <h2 className="font-display font-bold">{m.auth.demoTitle}</h2>
      <p className="mt-1 text-sm text-muted">{t(m.auth.demoBody, { pw: DEMO_PASSWORD })}</p>
      <div className="mt-4 flex flex-col gap-2">
        <Button variant="primary" onClick={() => signIn(DEMO_USERS.defne.email, "Defne")}>
          {m.auth.demoDefne}
        </Button>
        <Button variant="outline" onClick={() => signIn(DEMO_USERS.jonah.email, "Jonah")}>
          {m.auth.demoJonah}
        </Button>
      </div>
      <p className="num mt-3 text-xs text-muted">
        {DEMO_USERS.defne.email}
        <br />
        {DEMO_USERS.jonah.email}
      </p>
      <p className="mt-3 text-xs text-subtle">{m.auth.demoNote}</p>
    </Card>
  );
}

const errorText = (m: ReturnType<typeof useI18n>["m"], code: string) => m.errors[code as keyof typeof m.errors] ?? m.errors.generic;

export function LoginPage() {
  const { m, t } = useI18n();
  const { run } = useStore();
  const after = useAfterAuth();
  const toast = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  return (
    <AuthShell title={m.auth.loginTitle} intro={m.auth.loginIntro} aside={<DemoAside />}>
      <CartNotice />
      <form
        className="space-y-4"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          const r = run((s, n) => loginUser(s, { email, password }, n));
          if (!r.ok) setError(errorText(m, r.error));
          else {
            toast("gain", t(m.auth.welcome, { name: email.split("@")[0] }));
            after();
          }
        }}
      >
        <Field label={m.auth.email} htmlFor="l-email">
          <Input id="l-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </Field>
        <Field label={m.auth.password} htmlFor="l-pw" error={error}>
          <Input id="l-pw" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required aria-invalid={!!error} />
        </Field>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button type="submit" variant="primary">
            {m.auth.submitLogin}
          </Button>
          <Link href="/reset-password" className="text-sm text-petrol-700 hover:underline">
            {m.auth.forgot}
          </Link>
        </div>
      </form>
      <p className="mt-6 text-sm text-muted">
        {m.auth.noAccount}{" "}
        <Link href="/register" className="font-medium text-petrol-700 hover:underline">
          {m.common.register}
        </Link>
      </p>
    </AuthShell>
  );
}

export function RegisterPage() {
  const { m, t, locale } = useI18n();
  const { run } = useStore();
  const after = useAfterAuth();
  const toast = useToast();
  const [f, setF] = useState({ name: "", email: "", password: "", country: "TR", accept: false });
  const [error, setError] = useState<{ field: string; text: string } | null>(null);
  const fieldOf = (code: string) => (code.startsWith("name") ? "name" : code.startsWith("email") ? "email" : code.startsWith("password") ? "password" : "accept");
  return (
    <AuthShell title={m.auth.registerTitle} intro={m.auth.registerIntro} aside={<DemoAside />}>
      <CartNotice />
      <form
        className="grid gap-4 sm:grid-cols-2"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          const r = run((s, n) => registerUser(s, { name: f.name, email: f.email, password: f.password, country: f.country, locale, acceptTerms: f.accept }, n));
          if (!r.ok) setError({ field: fieldOf(r.error), text: errorText(m, r.error) });
          else {
            toast("gain", t(m.auth.welcome, { name: f.name.split(" ")[0] }));
            after();
          }
        }}
      >
        <Field label={m.auth.name} htmlFor="r-name" error={error?.field === "name" ? error.text : null}>
          <Input id="r-name" autoComplete="name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} aria-invalid={error?.field === "name"} />
        </Field>
        <Field label={m.auth.email} htmlFor="r-email" error={error?.field === "email" ? error.text : null}>
          <Input id="r-email" type="email" autoComplete="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} aria-invalid={error?.field === "email"} />
        </Field>
        <Field label={m.auth.password} htmlFor="r-pw" hint={m.auth.passwordHint} error={error?.field === "password" ? error.text : null}>
          <Input id="r-pw" type="password" autoComplete="new-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} aria-invalid={error?.field === "password"} />
        </Field>
        <Field label={m.auth.country} htmlFor="r-country">
          <Select id="r-country" value={f.country} onChange={(e) => setF({ ...f, country: e.target.value })}>
            {COUNTRIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c[locale]}
              </option>
            ))}
          </Select>
        </Field>
        <div className="sm:col-span-2">
          <Checkbox
            id="r-accept"
            checked={f.accept}
            onChange={(e) => setF({ ...f, accept: e.target.checked })}
            label={
              <>
                {m.auth.acceptTerms.split("{terms}")[0]}
                <Link href="/legal/terms" className="text-petrol-700 underline">
                  {m.auth.terms}
                </Link>
                {m.auth.acceptTerms.split("{terms}")[1].split("{privacy}")[0]}
                <Link href="/legal/privacy" className="text-petrol-700 underline">
                  {m.auth.privacy}
                </Link>
                {m.auth.acceptTerms.split("{privacy}")[1]}
              </>
            }
          />
          {error?.field === "accept" && (
            <p role="alert" className="mt-1 text-xs font-medium text-loss">
              {error.text}
            </p>
          )}
        </div>
        <div className="sm:col-span-2">
          <Button type="submit" variant="primary">
            {m.auth.submitRegister}
          </Button>
        </div>
      </form>
      <p className="mt-6 text-sm text-muted">
        {m.auth.haveAccount}{" "}
        <Link href="/login" className="font-medium text-petrol-700 hover:underline">
          {m.common.signIn}
        </Link>
      </p>
    </AuthShell>
  );
}

export function ResetPasswordPage() {
  const { m } = useI18n();
  const { run } = useStore();
  const params = useSearchParams();
  const token = params.get("token");
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState<{ token: string | null } | null>(null);
  const [pw, setPw] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  if (token)
    return (
      <AuthShell title={m.auth.resetTitle} intro={m.auth.newPassword}>
        {done ? (
          <Notice tone="gain" title={m.auth.resetDone}>
            <LinkButton href="/login" size="sm" className="mt-2">
              {m.common.signIn}
            </LinkButton>
          </Notice>
        ) : (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              const r = run((s, n) => resetPassword(s, token, pw, n));
              if (r.ok) setDone(true);
              else setError(errorText(m, r.error));
            }}
          >
            <Field label={m.auth.newPassword} htmlFor="np" hint={m.auth.passwordHint} error={error}>
              <Input id="np" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} />
            </Field>
            <Button type="submit">{m.auth.setPassword}</Button>
          </form>
        )}
      </AuthShell>
    );
  return (
    <AuthShell title={m.auth.resetTitle} intro={m.auth.resetIntro}>
      {sent ? (
        <div className="space-y-4">
          <Notice tone="info">{m.auth.resetSent}</Notice>
          {sent.token && (
            <div className="rounded-[12px] border border-dashed border-line bg-paper p-4 text-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">{m.auth.resetDemoInbox}</p>
              <p className="mt-2">{m.emails.from}</p>
              <p className="mt-1 font-semibold">{m.auth.resetTitle}</p>
              <LinkButton href={`/reset-password?token=${sent.token}`} size="sm" className="mt-3">
                {m.auth.resetOpen}
              </LinkButton>
              <p className="mt-3 text-xs text-subtle">{m.emails.footer}</p>
            </div>
          )}
        </div>
      ) : (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            const r = run((s, n) => requestPasswordReset(s, email, n));
            if (r.ok) setSent(r.value);
          }}
        >
          <Field label={m.auth.email} htmlFor="re" error={error}>
            <Input id="re" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Button type="submit">{m.auth.resetSend}</Button>
        </form>
      )}
    </AuthShell>
  );
}

"use client";

import { EyeIcon, EyeOffIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import { passwordProblem, passwordStrength } from "@stagedesk/core";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type Props = Omit<React.ComponentProps<typeof Input>, "type"> & {
  /** Show the strength meter and what would make the password stronger (for new passwords). */
  meter?: boolean;
  /** Check the browser's validity against the shared password rules (for new passwords). */
  rules?: boolean;
  /** For a confirmation field: the id of the password it must match. */
  matches?: string;
};

const bars = ["", "bg-destructive", "bg-warning", "bg-info", "bg-success"] as const;
const labels = ["", "weak", "fair", "good", "strong"] as const;

/**
 * A password field with a show/hide button. New passwords can show a strength
 * meter and are held to the shared rules; a confirmation field checks that it
 * matches. Works in plain forms (uncontrolled) and with value/onChange.
 */
export function PasswordInput({ meter, rules, matches, className, onChange, value, defaultValue, ...props }: Props) {
  const t = useTranslations("password");
  const [visible, setVisible] = useState(false);
  const [own, setOwn] = useState(String(value ?? defaultValue ?? ""));
  const current = value !== undefined ? String(value) : own;
  const strength = passwordStrength(current);
  const hintId = useId();

  function validate(input: HTMLInputElement) {
    let message = "";
    if (rules && input.value) {
      const problem = passwordProblem(input.value);
      if (problem) message = t(`problem_${problem}`);
    }
    if (matches && input.value) {
      const other = document.getElementById(matches) as HTMLInputElement | null;
      if (other && other.value !== input.value) message = t("mismatch");
    }
    input.setCustomValidity(message);
  }

  return (
    <div className="grid gap-1.5">
      <div className="relative">
        <Input
          {...props}
          type={visible ? "text" : "password"}
          value={value}
          defaultValue={value === undefined ? defaultValue : undefined}
          className={cn("pr-10", className)}
          aria-describedby={meter ? hintId : props["aria-describedby"]}
          onChange={(e) => {
            setOwn(e.target.value);
            validate(e.currentTarget);
            // A changed password re-checks the confirmation field that points at it.
            if (props.id) {
              const confirm = document.querySelector<HTMLInputElement>(`[data-matches="${props.id}"]`);
              if (confirm?.value) confirm.setCustomValidity(confirm.value === e.currentTarget.value ? "" : t("mismatch"));
            }
            onChange?.(e);
          }}
          onBlur={(e) => {
            validate(e.currentTarget);
            props.onBlur?.(e);
          }}
          data-matches={matches}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          className="absolute inset-y-0 right-0 grid w-9 place-items-center rounded-r-lg text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          aria-label={visible ? t("hide") : t("show")}
          aria-pressed={visible}
          tabIndex={0}
        >
          {visible ? <EyeOffIcon className="size-4" aria-hidden /> : <EyeIcon className="size-4" aria-hidden />}
        </button>
      </div>
      {meter && (
        <div id={hintId} className="grid gap-1" aria-live="polite">
          <div className="grid grid-cols-4 gap-1" aria-hidden>
            {[1, 2, 3, 4].map((n) => (
              <span key={n} className={cn("h-1 rounded-full bg-muted transition-colors", strength.score >= n && bars[strength.score])} />
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            {strength.score === 0 ? (
              t("rules")
            ) : (
              <>
                <span className="font-medium text-foreground">{t(labels[strength.score])}</span>
                {strength.tips.length > 0 && ` · ${strength.tips.map((tip) => t(`tip_${tip}`)).join(", ")}`}
              </>
            )}
          </p>
        </div>
      )}
    </div>
  );
}

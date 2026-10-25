"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./select";

type OptionProps = { value?: string | number; children?: React.ReactNode; disabled?: boolean };

/**
 * Drop-in for a native <select> with <option> children, rendered as the
 * searchable Select. Works in GET forms (name/defaultValue) and controlled
 * forms (value/onChange receive e.target.value as before).
 */
export function NativeSelect({
  id,
  name,
  value,
  defaultValue,
  onChange,
  required,
  disabled,
  className,
  children,
  "aria-label": ariaLabel,
}: {
  id?: string;
  name?: string;
  value?: string | number;
  defaultValue?: string | number;
  onChange?: (e: { target: { value: string }; currentTarget: { value: string } }) => void;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  children?: React.ReactNode;
  "aria-label"?: string;
}) {
  const options = React.Children.toArray(children).flatMap((child) =>
    React.isValidElement<OptionProps>(child) && child.type === "option" ? [{ value: String(child.props.value ?? ""), label: child.props.children, disabled: child.props.disabled }] : [],
  );
  return (
    <Select
      name={name}
      value={value === undefined ? undefined : String(value)}
      defaultValue={defaultValue === undefined ? undefined : String(defaultValue)}
      onValueChange={(v) => onChange?.({ target: { value: v }, currentTarget: { value: v } })}
      required={required}
      disabled={disabled}
    >
      <SelectTrigger id={id} aria-label={ariaLabel} className={cn("h-9 min-w-36", className)}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value} disabled={o.disabled}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

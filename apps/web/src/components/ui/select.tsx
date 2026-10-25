"use client"

/**
 * A searchable select with the same parts and props as the Radix one it
 * replaced (Select, SelectTrigger, SelectValue, SelectContent, SelectItem…),
 * so every picker in the app gets a search box without changing call sites.
 * Built on a popover with cmdk for filtering and keyboard navigation.
 */

import * as React from "react"
import { cn } from "cn"
import { Command as CommandPrimitive } from "cmdk"
import { Popover as PopoverPrimitive } from "radix-ui"
import { CheckIcon, ChevronDownIcon, SearchIcon } from "lucide-react"
import { useTranslations } from "next-intl"

type Option = { label: React.ReactNode; text: string; disabled?: boolean }

interface SelectContextValue {
  value: string | undefined
  select: (value: string) => void
  open: boolean
  setOpen: (open: boolean) => void
  disabled?: boolean
  options: React.RefObject<Map<string, Option>>
  /** Bumped when an option's label changes, so the trigger shows it. */
  version: number
  bump: () => void
  query: string
  setQuery: (q: string) => void
  /** The highlighted option while open; starts on the selected one. */
  active: string
  setActive: (value: string) => void
  triggerId: string
}

const SelectContext = React.createContext<SelectContextValue | null>(null)
/** cmdk can't key an item by "" (used for "All …" options), so item keys carry a prefix. */
const key = (value: string) => `v:${value}`

/** Every typed word must appear in the option's text (no fuzzy matches: "karachi" shouldn't find Khartoum). */
function matches(_value: string, search: string, keywords?: string[]) {
  const haystack = (keywords ?? []).join(" ").toLowerCase()
  return search
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => haystack.includes(word))
    ? 1
    : 0
}

/** True while the closed list is rendered only to learn the options' labels. */
const CollectContext = React.createContext(false)

function useSelect() {
  const ctx = React.useContext(SelectContext)
  if (!ctx) throw new Error("Select parts must be inside <Select>")
  return ctx
}

/** The plain text of a label, for searching ("Euro" in <><Flag /> Euro</>). */
function textOf(node: React.ReactNode): string {
  if (node === null || node === undefined || typeof node === "boolean") return ""
  if (typeof node === "string" || typeof node === "number") return String(node)
  if (Array.isArray(node)) return node.map(textOf).join(" ")
  if (React.isValidElement<{ children?: React.ReactNode }>(node)) return textOf(node.props.children)
  return ""
}

function Select({
  value: controlled,
  defaultValue,
  onValueChange,
  open: openProp,
  onOpenChange,
  disabled,
  name,
  required,
  children,
}: {
  value?: string
  defaultValue?: string
  onValueChange?: (value: string) => void
  open?: boolean
  onOpenChange?: (open: boolean) => void
  disabled?: boolean
  name?: string
  required?: boolean
  children?: React.ReactNode
}) {
  const [inner, setInner] = React.useState(defaultValue)
  const value = controlled !== undefined ? controlled : inner
  const [openInner, setOpenInner] = React.useState(false)
  const open = openProp ?? openInner
  const [query, setQuery] = React.useState("")
  const [active, setActive] = React.useState("")
  const [version, setVersion] = React.useState(0)
  const options = React.useRef(new Map<string, Option>())
  const triggerId = React.useId()

  const setOpen = React.useCallback(
    (next: boolean) => {
      if (next && disabled) return
      if (next) setActive(key(value ?? ""))
      else setQuery("")
      setOpenInner(next)
      onOpenChange?.(next)
    },
    [disabled, onOpenChange, value]
  )
  const select = React.useCallback(
    (next: string) => {
      if (controlled === undefined) setInner(next)
      onValueChange?.(next)
      setOpen(false)
    },
    [controlled, onValueChange, setOpen]
  )
  const bump = React.useCallback(() => setVersion((v) => v + 1), [])

  const ctx = { value, select, open, setOpen, disabled, options, version, bump, query, setQuery, active, setActive, triggerId }
  return (
    <SelectContext.Provider value={ctx}>
      <PopoverPrimitive.Root open={open} onOpenChange={setOpen} modal>
        {children}
      </PopoverPrimitive.Root>
      {name !== undefined && (
        <input
          type="text"
          name={name}
          value={value ?? ""}
          required={required}
          onChange={() => {}}
          tabIndex={-1}
          aria-hidden
          className="pointer-events-none absolute size-px opacity-0"
          onFocus={() => document.getElementById(triggerId)?.focus()}
        />
      )}
    </SelectContext.Provider>
  )
}

function SelectGroup({ className, children }: { className?: string; children?: React.ReactNode }) {
  if (React.useContext(CollectContext)) return <>{children}</>
  return (
    <CommandPrimitive.Group data-slot="select-group" className={cn("scroll-my-1 p-1", className)}>
      {children}
    </CommandPrimitive.Group>
  )
}

function SelectValue({ placeholder }: { placeholder?: React.ReactNode }) {
  const { value, options } = useSelect()
  const option = value !== undefined ? options.current.get(value) : undefined
  return <span data-slot="select-value">{option ? option.label : placeholder}</span>
}

function SelectTrigger({
  className,
  size = "default",
  children,
  id,
  onKeyDown,
  ...props
}: React.ComponentProps<"button"> & {
  size?: "sm" | "default"
}) {
  const { value, open, setOpen, disabled, options, setQuery, triggerId } = useSelect()
  const empty = value === undefined || !options.current.has(value)
  return (
    <PopoverPrimitive.Trigger asChild>
      <button
        type="button"
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        id={id ?? triggerId}
        disabled={disabled}
        data-slot="select-trigger"
        data-size={size}
        data-placeholder={empty ? "" : undefined}
        onKeyDown={(e) => {
          onKeyDown?.(e)
          // Typing on a closed select opens it with that letter in the search box.
          if (!open && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey && e.key !== " ") {
            e.preventDefault()
            setQuery(e.key)
            setOpen(true)
          } else if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
            e.preventDefault()
            setOpen(true)
          }
        }}
        className={cn(
          "flex w-fit items-center justify-between gap-1.5 rounded-lg border border-input bg-transparent py-2 pr-2 pl-2.5 text-left text-sm whitespace-nowrap transition-colors outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 data-placeholder:text-muted-foreground data-[size=default]:h-8 data-[size=sm]:h-7 data-[size=sm]:rounded-[min(var(--radius-md),10px)] *:data-[slot=select-value]:line-clamp-1 *:data-[slot=select-value]:flex *:data-[slot=select-value]:items-center *:data-[slot=select-value]:gap-1.5 dark:bg-input/30 dark:hover:bg-input/50 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
          className
        )}
        {...props}
      >
        {children}
        <ChevronDownIcon className="pointer-events-none size-4 text-muted-foreground" />
      </button>
    </PopoverPrimitive.Trigger>
  )
}

function SelectContent({
  className,
  children,
  align = "start",
}: {
  className?: string
  children?: React.ReactNode
  /** Accepted for compatibility with the Radix select; the list opens below or above the trigger. */
  position?: "popper" | "item-aligned"
  align?: "start" | "center" | "end"
}) {
  const { open, query, setQuery, active, setActive } = useSelect()
  const t = useTranslations("select")

  return (
    <>
      {/* Closed: render the items invisibly so the trigger knows their labels. */}
      {!open && <CollectContext.Provider value={true}>{children}</CollectContext.Provider>}
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          data-slot="select-content"
          align={align}
          sideOffset={4}
          collisionPadding={8}
          className={cn(
            "z-50 flex max-h-[min(22rem,var(--radix-popover-content-available-height))] w-(--radix-popover-trigger-width) min-w-48 origin-(--radix-popover-content-transform-origin) flex-col overflow-hidden rounded-lg bg-popover text-popover-foreground shadow-md ring-1 ring-foreground/10 duration-100 data-[side=bottom]:slide-in-from-top-2 data-[side=top]:slide-in-from-bottom-2 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
            className
          )}
        >
          <CommandPrimitive value={active} onValueChange={setActive} filter={matches} className="flex min-h-0 flex-col" loop>
            <div className="flex items-center gap-2 border-b px-2.5">
              <SearchIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              <CommandPrimitive.Input
                value={query}
                onValueChange={setQuery}
                placeholder={t("search")}
                className="h-9 w-full min-w-0 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
            </div>
            <CommandPrimitive.List className="min-h-0 overflow-x-hidden overflow-y-auto overscroll-contain p-1">
              <CommandPrimitive.Empty className="py-6 text-center text-sm text-muted-foreground">{t("empty")}</CommandPrimitive.Empty>
              {children}
            </CommandPrimitive.List>
          </CommandPrimitive>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </>
  )
}

function SelectLabel({ className, ...props }: React.ComponentProps<"div">) {
  if (React.useContext(CollectContext)) return null
  return <div data-slot="select-label" className={cn("px-1.5 py-1 text-xs text-muted-foreground", className)} {...props} />
}

function SelectItem({
  className,
  children,
  value,
  disabled,
  textValue,
}: {
  className?: string
  children?: React.ReactNode
  value: string
  disabled?: boolean
  /** Extra words to match when searching, besides the visible text. */
  textValue?: string
}) {
  const collecting = React.useContext(CollectContext)
  const { value: selected, select, options, bump } = useSelect()
  const text = `${textOf(children)} ${textValue ?? ""}`.trim()

  // Register the label for the trigger; re-render it only when the text changes.
  React.useLayoutEffect(() => {
    const known = options.current.get(value)
    options.current.set(value, { label: children, text, disabled })
    if (!known || known.text !== text) bump()
  })

  if (collecting) return null
  const isSelected = selected === value
  return (
    <CommandPrimitive.Item
      value={key(value)}
      keywords={[text]}
      disabled={disabled}
      onSelect={() => select(value)}
      aria-selected={isSelected}
      data-checked={isSelected || undefined}
      data-slot="select-item"
      className={cn(
        "relative flex w-full cursor-default items-center gap-1.5 rounded-md py-1.5 pr-8 pl-1.5 text-sm outline-hidden select-none data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
    >
      <span className="flex min-w-0 flex-1 items-center gap-2">{children}</span>
      {isSelected && (
        <span className="pointer-events-none absolute right-2 flex size-4 items-center justify-center">
          <CheckIcon />
        </span>
      )}
    </CommandPrimitive.Item>
  )
}

function SelectSeparator({ className }: { className?: string }) {
  if (React.useContext(CollectContext)) return null
  return <CommandPrimitive.Separator data-slot="select-separator" className={cn("pointer-events-none -mx-1 my-1 h-px bg-border", className)} />
}

/** Kept for compatibility with the Radix select; the list scrolls natively. */
function SelectScrollUpButton() {
  return null
}
function SelectScrollDownButton() {
  return null
}

export {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectScrollDownButton,
  SelectScrollUpButton,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
}

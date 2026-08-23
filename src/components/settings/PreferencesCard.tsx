import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Check, ChevronRight, Languages, Monitor, Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT, type Lang } from "@/lib/i18n";
import { useHydrated } from "@/hooks/use-hydrated";
import {
  readStoredThemeMode,
  setStoredThemeMode,
  type ThemeMode,
} from "@/components/dashboard/ThemeToggle";

const LANGUAGES: { code: Lang; label: string; native: string }[] = [
  { code: "en", label: "English", native: "English" },
  { code: "hi", label: "Hindi", native: "हिन्दी" },
];

const THEMES: {
  value: ThemeMode;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { value: "system", label: "System", icon: Monitor },
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
];

function useIsDesktop() {
  const hydrated = useHydrated();
  const [isDesktop, setIsDesktop] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(min-width: 768px)");
    const update = () => setIsDesktop(mq.matches);
    update();
    mq.addEventListener?.("change", update);
    return () => mq.removeEventListener?.("change", update);
  }, []);
  return hydrated && isDesktop;
}

export function PreferencesCard() {
  const { lang, setLang } = useT();
  const hydrated = useHydrated();
  const isDesktop = useIsDesktop();

  const [themeMode, setThemeModeState] = useState<ThemeMode>("system");
  const [langOpen, setLangOpen] = useState(false);

  useEffect(() => {
    setThemeModeState(readStoredThemeMode());
  }, []);

  const currentLang = LANGUAGES.find((l) => l.code === lang) ?? LANGUAGES[0];

  const chooseLang = (code: Lang) => {
    setLang(code);
    setLangOpen(false);
  };

  const chooseTheme = (mode: ThemeMode) => {
    setThemeModeState(mode);
    setStoredThemeMode(mode);
  };

  const LanguageOptions = (
    <div className="py-1">
      {LANGUAGES.map((l) => {
        const active = l.code === lang;
        return (
          <button
            key={l.code}
            type="button"
            onClick={() => chooseLang(l.code)}
            className={cn(
              "w-full flex items-center justify-between px-4 py-3.5 text-left text-[15px]",
              "hover:bg-muted active:bg-muted/70 transition-colors",
              active && "font-medium",
            )}
          >
            <span>
              {l.native}
              {l.native !== l.label ? ` · ${l.label}` : ""}
            </span>
            {active ? <Check className="size-4 text-[color:var(--brand)]" /> : null}
          </button>
        );
      })}
    </div>
  );

  return (
    <Card className="overflow-hidden p-0">
      <div className="px-4 pt-4 pb-2">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Preferences
        </h2>
      </div>

      {/* Language row */}
      {isDesktop ? (
        <Popover open={langOpen} onOpenChange={setLangOpen}>
          <PopoverTrigger asChild>
            <button type="button" className={rowClass}>
              <RowLeft icon={Languages} label="'''Do not make any visual modifications. The phrases I write are commands to understand what I want, not to be written down. Understand their content well, then execute what is required.'''\n                                            \n                                            Firstly, fix there's a lot of bugs are there in the application. I don't know how you plan it, but it's still not working. So first thing you need to do that is let the students able to upload their profile photo. Because right now, when the students on the-- go to the profile and click on to upload their photos, it shows some page function error kind of thing. So fix that logic, very, very important. And also make sure everything should work correctly\n\nAnd second thing also make sure when user check-in or check-out scanning the QR code, the processing, it is taking too much time for a processing. I mean, you shouldn't need to wait. It should work instantly, right? I mean, instantly mean instantly. Correct? Check-in, check-out. Simple, right? Do not, uh, give them again to come-- like if they're scanning the QR code. So don't-- Why we are asking them to click on check-in? I mean, they are scanning the QR for check-in, so they scan automatically check-in. We simply show congratulations or you checked in. Done. That's it, right? Or check-out, you check-out. Done. That's it.\n\nAnd what you can do for a checkout, you can simply-- On a checkout, you can give a confirmation me-message to checkout. Are you confirm you want to checkout? Yes or no? Yes, checkout. Done. So people not mistakenly checkout, but check-in work instantly, like scan check-in automatically done.\n\nMake sure that the, uh, numbers of how many hours they are in the academy or number of days or str-streak they have maintaining or going should calculate correctly, right?" />

              <RowRight value={hydrated ? currentLang.native : ""} />
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-56 p-0">
            {LanguageOptions}
          </PopoverContent>
        </Popover>
      ) : (
        <Sheet open={langOpen} onOpenChange={setLangOpen}>
          <SheetTrigger asChild>
            <button type="button" className={rowClass}>
              <RowLeft icon={Languages} label="'''Do not make any visual modifications. The phrases I write are commands to understand what I want, not to be written down. Understand their content well, then execute what is required.'''\n                                            \n                                            Firstly, fix there's a lot of bugs are there in the application. I don't know how you plan it, but it's still not working. So first thing you need to do that is let the students able to upload their profile photo. Because right now, when the students on the-- go to the profile and click on to upload their photos, it shows some page function error kind of thing. So fix that logic, very, very important. And also make sure everything should work correctly\n\nAnd second thing also make sure when user check-in or check-out scanning the QR code, the processing, it is taking too much time for a processing. I mean, you shouldn't need to wait. It should work instantly, right? I mean, instantly mean instantly. Correct? Check-in, check-out. Simple, right? Do not, uh, give them again to come-- like if they're scanning the QR code. So don't-- Why we are asking them to click on check-in? I mean, they are scanning the QR for check-in, so they scan automatically check-in. We simply show congratulations or you checked in. Done. That's it, right? Or check-out, you check-out. Done. That's it.\n\nAnd what you can do for a checkout, you can simply-- On a checkout, you can give a confirmation me-message to checkout. Are you confirm you want to checkout? Yes or no? Yes, checkout. Done. So people not mistakenly checkout, but check-in work instantly, like scan check-in automatically done.\n\nMake sure that the, uh, numbers of how many hours they are in the academy or number of days or str-streak they have maintaining or going should calculate correctly, right?" />
              <RowRight value={hydrated ? currentLang.native : ""} />
            </button>
          </SheetTrigger>
          <SheetContent
            side="bottom"
            className="rounded-t-2xl border-t border-border p-0 pb-[var(--app-safe-bottom)]"
          >
            <SheetHeader className="px-4 pt-4 pb-2 text-left">
              <SheetTitle className="text-base">Select Language</SheetTitle>
            </SheetHeader>
            {LanguageOptions}
          </SheetContent>
        </Sheet>
      )}

      <div className="h-px bg-border/70 mx-4" />

      {/* Theme row — inline segmented list for native settings feel */}
      <div className="px-4 pt-3 pb-4">
        <div className="flex items-center gap-3 pb-2">
          <span className="inline-flex size-8 items-center justify-center rounded-lg bg-muted text-foreground">
            <Sun className="size-4" />
          </span>
          <span className="text-[15px] font-medium">Theme</span>
        </div>
        <div
          role="radiogroup"
          aria-label="Theme"
          className="grid grid-cols-3 gap-2 rounded-xl border border-border bg-muted/40 p-1"
        >
          {THEMES.map((opt) => {
            const active = themeMode === opt.value;
            const Icon = opt.icon;
            return (
              <button
                key={opt.value}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => chooseTheme(opt.value)}
                className={cn(
                  "flex flex-col items-center justify-center gap-1 rounded-lg py-2.5 text-xs font-medium transition-colors",
                  active
                    ? "bg-background text-foreground shadow-sm border border-border"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="size-4" />
                {opt.label}
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">
          System follows your device appearance.
        </p>
      </div>
    </Card>
  );
}

const rowClass =
  "w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-muted/60 active:bg-muted/80 transition-colors";

function RowLeft({
  icon: Icon,
  label,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}) {
  return (
    <div className="flex items-center gap-3 min-w-0">
      <span className="inline-flex size-8 items-center justify-center rounded-lg bg-muted text-foreground">
        <Icon className="size-4" />
      </span>
      <span className="text-[15px] font-medium truncate">{label}</span>
    </div>
  );
}

function RowRight({ value }: { value: string }) {
  return (
    <div className="ml-auto flex items-center gap-1.5 text-sm text-muted-foreground">
      <span>{value}</span>
      <ChevronRight className="size-4" />
    </div>
  );
}

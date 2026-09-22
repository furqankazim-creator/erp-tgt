import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { CheckCircle2, Loader2, Mail, Send, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { callApi } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/inquire")({
  head: () => ({
    meta: [
      { title: "Get in touch — Time Global Tech" },
      {
        name: "description",
        content: "Tell us about your project and we'll get back to you within one business day.",
      },
      { property: "og:title", content: "Get in touch — Time Global Tech" },
      {
        property: "og:description",
        content: "Submit an inquiry and our team will follow up shortly.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: InquirePage,
});

type PublicCompany = {
  display_name: string | null;
  tagline: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
} | null;

type PublicService = { id: string; name: string; category: string };

function useCompanyBranding() {
  const [company, setCompany] = useState<PublicCompany>(null);
  useEffect(() => {
    callApi("/public/company")
      .then((c) => setCompany(c as PublicCompany))
      .catch(() => setCompany(null));
  }, []);
  return company;
}

function useServiceOptions() {
  const [services, setServices] = useState<PublicService[]>([]);
  useEffect(() => {
    callApi("/public/services")
      .then((rows) => setServices((rows as PublicService[]) ?? []))
      .catch(() => setServices([]));
  }, []);
  return services;
}

function InquirePage() {
  const company = useCompanyBranding();
  const services = useServiceOptions();
  const displayName = company?.display_name || "Time Global Tech";

  const [clientName, setClientName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!clientName.trim() || !description.trim()) {
      toast.error("Name and message are required.");
      return;
    }
    setBusy(true);
    try {
      await callApi("/public/inquiries", {
        method: "POST",
        body: JSON.stringify({
          client_name: clientName.trim(),
          company: companyName.trim() || undefined,
          email: email.trim() || undefined,
          phone: phone.trim() || undefined,
          service_id: serviceId || undefined,
          description: description.trim(),
        }),
      });
      setSubmitted(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to submit — please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <div className="animate-rise w-full max-w-lg">
        <Link to="/" className="mb-8 flex items-center justify-center gap-2.5">
          <span className="gradient-primary text-primary-foreground grid size-9 place-items-center rounded-xl">
            <Sparkles className="size-5" />
          </span>
          <span className="font-bold">{displayName}</span>
        </Link>

        {submitted ? (
          <div className="surface-card flex flex-col items-center gap-3 p-10 text-center">
            <span className="grid size-12 place-items-center rounded-full bg-success/15 text-success">
              <CheckCircle2 className="size-6" />
            </span>
            <h1 className="text-xl font-bold tracking-tight">Thanks — we got it.</h1>
            <p className="text-sm text-muted-foreground">
              A confirmation email is on its way to you, and someone from our team will follow up
              within one business day.
            </p>
          </div>
        ) : (
          <div className="surface-card p-6 sm:p-8">
            <h1 className="text-xl font-bold tracking-tight">Tell us about your project</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {company?.tagline || "We'll get back to you within one business day."}
            </p>

            <form onSubmit={submit} className="mt-6 space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="client_name" className="mb-1.5 block text-xs font-semibold">
                    Your name <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="client_name"
                    required
                    value={clientName}
                    onChange={(e) => setClientName(e.target.value)}
                    placeholder="Jane Doe"
                  />
                </div>
                <div>
                  <Label htmlFor="company_name" className="mb-1.5 block text-xs font-semibold">
                    Company
                  </Label>
                  <Input
                    id="company_name"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    placeholder="Acme Inc."
                  />
                </div>
                <div>
                  <Label htmlFor="email" className="mb-1.5 block text-xs font-semibold">
                    Email
                  </Label>
                  <div className="relative">
                    <Mail className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
                    <Input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="jane@acme.com"
                      className="pl-9"
                    />
                  </div>
                </div>
                <div>
                  <Label htmlFor="phone" className="mb-1.5 block text-xs font-semibold">
                    Phone
                  </Label>
                  <Input
                    id="phone"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+1 234 567 8900"
                  />
                </div>
              </div>

              {services.length ? (
                <div>
                  <Label className="mb-1.5 block text-xs font-semibold">
                    Which service are you interested in?
                  </Label>
                  <Select value={serviceId} onValueChange={setServiceId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a service (optional)" />
                    </SelectTrigger>
                    <SelectContent>
                      {services.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}

              <div>
                <Label htmlFor="description" className="mb-1.5 block text-xs font-semibold">
                  Tell us about your project <span className="text-destructive">*</span>
                </Label>
                <Textarea
                  id="description"
                  required
                  rows={4}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="What are you looking to build, and what's the timeline?"
                />
              </div>

              <Button type="submit" className="w-full" disabled={busy}>
                {busy && <Loader2 className="size-4 animate-spin" />}
                {busy ? "Sending…" : "Send inquiry"}
                {!busy && <Send className="size-4" />}
              </Button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}

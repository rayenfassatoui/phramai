"use client";

import * as React from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface Tenant {
  id: string;
  label: string;
  key: string;
}

interface TenantSelectorProps {
  value: string;
  onValueChange: (value: string) => void;
  tenants: readonly Tenant[];
}

export function TenantSelector({ value, onValueChange, tenants }: TenantSelectorProps) {
  return (
    <div className="space-y-3">
      <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
        Tenant Context
      </label>
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger className="w-full bg-background shadow-sm">
          <SelectValue placeholder="Select Tenant" />
        </SelectTrigger>
        <SelectContent>
          {tenants.map((tenant) => (
            <SelectItem key={tenant.id} value={tenant.id}>
              {tenant.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useCreateDevice } from "@/hooks/use-devices";
import { Monitor, Smartphone, Plus, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const deviceSchema = z.object({
  deviceId: z.string().min(3, "Device ID must be at least 3 characters"),
  name: z.string().min(2, "Name must be at least 2 characters"),
  os: z.enum(["windows", "android"]),
});

export function AddDeviceDialog() {
  const [open, setOpen] = useState(false);
  const { mutate: createDevice, isPending } = useCreateDevice();
  const { toast } = useToast();

  const form = useForm<z.infer<typeof deviceSchema>>({
    resolver: zodResolver(deviceSchema),
    defaultValues: {
      deviceId: "",
      name: "",
      os: "windows",
    },
  });

  const onSubmit = (data: z.infer<typeof deviceSchema>) => {
    createDevice(data, {
      onSuccess: () => {
        toast({ title: "Device registered successfully!" });
        setOpen(false);
        form.reset();
      },
      onError: (err) => {
        toast({
          title: "Failed to register device",
          description: err.message,
          variant: "destructive",
        });
      },
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="rounded-full shadow-lg shadow-primary/20 gap-2">
          <Plus className="w-4 h-4" /> Add Device
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px] rounded-2xl">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">Register Device</DialogTitle>
          <DialogDescription>
            Add a new PC or Mobile device to your control network.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 mt-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Friendly Name</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. My Work Laptop" className="rounded-xl" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <FormField
              control={form.control}
              name="deviceId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Unique Device ID</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. PC-12345" className="rounded-xl" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="os"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Operating System</FormLabel>
                  <FormControl>
                    <div className="grid grid-cols-2 gap-4 mt-2">
                      <div
                        className={`cursor-pointer rounded-xl border-2 p-4 flex flex-col items-center gap-2 transition-all ${
                          field.value === "windows"
                            ? "border-primary bg-primary/5 text-primary"
                            : "border-border hover:border-border/80 text-muted-foreground"
                        }`}
                        onClick={() => field.onChange("windows")}
                      >
                        <Monitor className="w-8 h-8" />
                        <span className="font-medium">Windows</span>
                      </div>
                      <div
                        className={`cursor-pointer rounded-xl border-2 p-4 flex flex-col items-center gap-2 transition-all ${
                          field.value === "android"
                            ? "border-primary bg-primary/5 text-primary"
                            : "border-border hover:border-border/80 text-muted-foreground"
                        }`}
                        onClick={() => field.onChange("android")}
                      >
                        <Smartphone className="w-8 h-8" />
                        <span className="font-medium">Android</span>
                      </div>
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Button type="submit" className="w-full rounded-xl" disabled={isPending}>
              {isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              {isPending ? "Registering..." : "Register Device"}
            </Button>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

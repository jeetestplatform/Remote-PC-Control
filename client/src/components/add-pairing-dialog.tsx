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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { useCreatePairing } from "@/hooks/use-pairings";
import { useDevices } from "@/hooks/use-devices";
import { Link, Loader2, Monitor, Smartphone } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const pairingSchema = z.object({
  pcDeviceId: z.string().min(1, "Please select a PC"),
  mobileDeviceId: z.string().min(1, "Please select a Mobile device"),
});

export function AddPairingDialog() {
  const [open, setOpen] = useState(false);
  const { data: devices } = useDevices();
  const { mutate: createPairing, isPending } = useCreatePairing();
  const { toast } = useToast();

  const form = useForm<z.infer<typeof pairingSchema>>({
    resolver: zodResolver(pairingSchema),
    defaultValues: {
      pcDeviceId: "",
      mobileDeviceId: "",
    },
  });

  const pcDevices = devices?.filter((d) => d.os === "windows") || [];
  const mobileDevices = devices?.filter((d) => d.os === "android") || [];

  const onSubmit = (data: z.infer<typeof pairingSchema>) => {
    createPairing(data, {
      onSuccess: () => {
        toast({ title: "Devices paired successfully!" });
        setOpen(false);
        form.reset();
      },
      onError: (err) => {
        toast({
          title: "Failed to pair devices",
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
          <Link className="w-4 h-4" /> Create Pairing
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px] rounded-2xl">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">Create Pairing</DialogTitle>
          <DialogDescription>
            Link a Windows PC with an Android device to enable remote control.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 mt-4">
            <FormField
              control={form.control}
              name="pcDeviceId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="flex items-center gap-2">
                    <Monitor className="w-4 h-4 text-primary" /> Select PC
                  </FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger className="rounded-xl">
                        <SelectValue placeholder="Choose a Windows device" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {pcDevices.length === 0 ? (
                        <div className="p-4 text-sm text-muted-foreground text-center">
                          No Windows devices found.
                        </div>
                      ) : (
                        pcDevices.map((device) => (
                          <SelectItem key={device.deviceId} value={device.deviceId}>
                            {device.name} ({device.deviceId})
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="mobileDeviceId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="flex items-center gap-2">
                    <Smartphone className="w-4 h-4 text-primary" /> Select Mobile
                  </FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger className="rounded-xl">
                        <SelectValue placeholder="Choose an Android device" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {mobileDevices.length === 0 ? (
                        <div className="p-4 text-sm text-muted-foreground text-center">
                          No Android devices found.
                        </div>
                      ) : (
                        mobileDevices.map((device) => (
                          <SelectItem key={device.deviceId} value={device.deviceId}>
                            {device.name} ({device.deviceId})
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Button type="submit" className="w-full rounded-xl" disabled={isPending || pcDevices.length === 0 || mobileDevices.length === 0}>
              {isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              {isPending ? "Pairing..." : "Create Link"}
            </Button>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

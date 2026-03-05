import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useLocation } from "wouter";
import { useLogin, useRegister } from "@/hooks/use-auth";
import { MonitorSmartphone, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";

const authSchema = z.object({
  username: z.string().min(3, "Username must be at least 3 characters"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

export default function AuthPage() {
  const [, setLocation] = useLocation();
  const [isLogin, setIsLogin] = useState(true);
  const { mutate: login, isPending: isLoginPending } = useLogin();
  const { mutate: register, isPending: isRegisterPending } = useRegister();
  const { toast } = useToast();

  const isPending = isLoginPending || isRegisterPending;

  const form = useForm<z.infer<typeof authSchema>>({
    resolver: zodResolver(authSchema),
    defaultValues: {
      username: "",
      password: "",
    },
  });

  const onSubmit = (data: z.infer<typeof authSchema>) => {
    if (isLogin) {
      login(data, {
        onSuccess: () => setLocation("/"),
        onError: (err) => {
          toast({
            title: "Login failed",
            description: err.message,
            variant: "destructive",
          });
        },
      });
    } else {
      register(data, {
        onSuccess: () => {
          toast({ title: "Account created successfully!" });
          setLocation("/");
        },
        onError: (err) => {
          toast({
            title: "Registration failed",
            description: err.message,
            variant: "destructive",
          });
        },
      });
    }
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-background">
      {/* Left side: Branding */}
      <div className="hidden lg:flex flex-col justify-between p-12 bg-primary/5 border-r border-border">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary text-primary-foreground flex items-center justify-center shadow-lg shadow-primary/25">
            <MonitorSmartphone className="w-6 h-6" />
          </div>
          <span className="font-display font-bold text-2xl tracking-tight">Remo<span className="text-primary">Sync</span></span>
        </div>
        
        <div>
          <h1 className="text-5xl font-display font-bold leading-[1.1] mb-6">
            Control your workspace<br />from anywhere.
          </h1>
          <p className="text-muted-foreground text-lg max-w-md">
            Seamlessly pair your Windows workstation with your Android device for low-latency remote access.
          </p>
        </div>
        
        <p className="text-sm text-muted-foreground">
          © 2024 RemoSync. All rights reserved.
        </p>
      </div>

      {/* Right side: Form */}
      <div className="flex items-center justify-center p-8">
        <div className="w-full max-w-md space-y-8">
          <div className="lg:hidden flex justify-center mb-8">
            <div className="w-12 h-12 rounded-xl bg-primary text-primary-foreground flex items-center justify-center shadow-lg shadow-primary/25">
              <MonitorSmartphone className="w-7 h-7" />
            </div>
          </div>
          
          <div className="text-center lg:text-left space-y-2">
            <h2 className="text-3xl font-display font-bold tracking-tight">
              {isLogin ? "Welcome back" : "Create an account"}
            </h2>
            <p className="text-muted-foreground">
              {isLogin ? "Enter your credentials to access your devices" : "Get started with RemoSync today"}
            </p>
          </div>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <FormField
                control={form.control}
                name="username"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Username</FormLabel>
                    <FormControl>
                      <Input placeholder="Enter your username" className="rounded-xl px-4 py-6" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Password</FormLabel>
                    <FormControl>
                      <Input type="password" placeholder="Enter your password" className="rounded-xl px-4 py-6" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button type="submit" className="w-full py-6 rounded-xl text-md shadow-lg shadow-primary/20" disabled={isPending}>
                {isPending ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : null}
                {isPending ? "Please wait..." : (isLogin ? "Sign In" : "Sign Up")}
              </Button>
            </form>
          </Form>

          <div className="text-center mt-6">
            <button
              onClick={() => {
                setIsLogin(!isLogin);
                form.reset();
              }}
              className="text-sm text-muted-foreground hover:text-primary transition-colors"
            >
              {isLogin ? "Don't have an account? Sign up" : "Already have an account? Sign in"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginForm() {
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const router = useRouter();

    async function submit(e: React.FormEvent) {
        e.preventDefault();

        const response = await fetch("/api/auth/login", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                username,
                password,
            }),
        });

        const data = await response.json();
        console.log(data);
    
        if (response.ok) {
            //console.log(JSON.stringify(data));
            localStorage.setItem("token", data.data.token.token);
            localStorage.setItem(
               "user",
               JSON.stringify(data.data.token.user)
            )
            document.cookie = `token=${data.data.token.token}; path=/; max-age=86400`;
            console.log("LOGIN OK");
            router.push("/dashboard/inbox");
        }

    }

    return (
        <div className="w-full max-w-md rounded-2xl bg-white/10 backdrop-blur-lg p-8 shadow-2xl border border-white/20">
            <h1 className="text-3xl font-semibold text-white text-center">
                Welcome back
            </h1>

            <p className="mt-2 text-center text-slate-300">
                Sign in to your account
            </p>

            <form onSubmit={submit} className="mt-8 space-y-5">
                <div>
                    <label className="text-sm text-slate-200">
                        Username
                    </label>

                    <input
                        type="text"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        className="mt-2 w-full rounded-xl bg-white/10 border border-white/20 px-4 py-3 text-white placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-blue-400"
                        placeholder="you@example.com"
                    />
                </div>

                <div>
                    <label className="text-sm text-slate-200">
                        Password
                    </label>

                    <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="mt-2 w-full rounded-xl bg-white/10 border border-white/20 px-4 py-3 text-white outline-none focus:ring-2 focus:ring-blue-400"
                        placeholder="••••••••"
                    />
                </div>

                <button
                    type="submit"
                    className="w-full rounded-xl bg-blue-500 py-3 font-medium text-white transition hover:bg-blue-600 active:scale-[0.98]"
                >
                    Sign in
                </button>
            </form>
        </div>
    );
}
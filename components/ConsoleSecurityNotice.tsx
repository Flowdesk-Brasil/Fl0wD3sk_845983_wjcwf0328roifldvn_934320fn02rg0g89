"use client";

import { useEffect } from "react";
import { OFFICIAL_DISCORD_INVITE_URL } from "@/lib/discordLink/config";

export function ConsoleSecurityNotice() {
  useEffect(() => {
    const titleStyle =
      "color:#F1C40F;font-size:15px;font-weight:800;letter-spacing:0.04em;";
    const bodyStyle = "color:#B7B7B7;font-size:12px;line-height:1.65;";
    const brandStyle = "color:#0062FF;font-size:16px;font-weight:800;";
    const inviteStyle = "color:#66A3FF;font-size:12px;line-height:1.65;";

    console.log("%cFlowdesk", brandStyle);
    console.log("%cPARE!", titleStyle);
    console.log(
      "%cNao mexa aqui se alguem mandou colar codigo ou comandos neste console.",
      bodyStyle,
    );
    console.log(
      "%cIsso pode ser golpe — sua conta, dados e pagamentos podem ser roubados.",
      bodyStyle,
    );
    console.log(
      "%cObs: sabe o que esta fazendo aqui? Por que nao trabalha conosco? Abra um ticket no Discord!",
      inviteStyle,
    );
    console.log(`%c${OFFICIAL_DISCORD_INVITE_URL}`, inviteStyle);
  }, []);

  return null;
}


"use strict";

// ==========================================
// CONFIGURACOES
// ==========================================

const LATITUDE = -23.0884;
const LONGITUDE = -47.2119;

let porta = null;
let leitor = null;
let escritor = null;

let bufferSerial = "";

let chuvaPrevista = 0;
let chuvaAcumulada = 0;

let meteorologiaDisponivel = false;
let conectando = false;
let conectado = false;

// ==========================================
// ELEMENTOS HTML
// ==========================================

const btnConectar =
    document.getElementById("btnConectar");

const statusConexao =
    document.getElementById("statusConexao");

const statusSistema =
    document.getElementById("statusSistema");

// ==========================================
// STATUS DA CONEXAO
// ==========================================

function atualizarStatus(online, mensagem) {

    statusConexao.textContent = mensagem;

    statusSistema.textContent = online
        ? "ESP8266 CONECTADO"
        : "ESP8266 DESCONECTADO";

    statusSistema.className = online
        ? "status online"
        : "status offline";

}

// ==========================================
// CONECTAR ESP8266
// ==========================================

async function conectarESP() {

    if (!("serial" in navigator)) {

        alert(
            "Seu navegador nao suporta Web Serial. " +
            "Utilize Google Chrome ou Microsoft Edge."
        );

        return;
    }

    if (conectando || conectado) return;

    conectando = true;
    btnConectar.disabled = true;

    try {

        porta = await navigator.serial.requestPort();

        await porta.open({
            baudRate: 115200
        });

        escritor = porta.writable.getWriter();

        conectado = true;

        atualizarStatus(
            true,
            "ESP8266 conectado. Comunicacao USB ativa."
        );

        btnConectar.textContent = "ESP8266 conectado";

        // Inicia a leitura serial
        lerDadosSerial();

        // Aguarda inicializacao da placa
        await new Promise(resolve =>
            setTimeout(resolve, 1500)
        );

        // Consulta meteorologia
        await buscarMeteorologia();

    } catch (erro) {

        console.error("Erro USB:", erro);

        atualizarStatus(
            false,
            "Falha na conexao. Verifique o cabo e a porta."
        );

        conectado = false;

        btnConectar.textContent = "Conectar ESP8266";

        if (escritor) {
            try {
                escritor.releaseLock();
            } catch (e) {}
        }

        escritor = null;

        if (porta) {
            try {
                await porta.close();
            } catch (e) {}
        }

        porta = null;

    } finally {

        conectando = false;

        btnConectar.disabled = false;

    }

}

// ==========================================
// EVENTO DO BOTAO
// ==========================================

btnConectar.addEventListener(
    "click",
    conectarESP
);

// ==========================================
// LEITURA SERIAL
// ==========================================

async function lerDadosSerial() {

    if (!porta || !porta.readable) return;

    leitor = porta.readable.getReader();

    const decoder = new TextDecoder();

    try {

        while (true) {

            const resultado = await leitor.read();

            if (resultado.done) break;

            bufferSerial += decoder.decode(
                resultado.value,
                { stream: true }
            );

            const linhas = bufferSerial.split("\n");

            bufferSerial = linhas.pop();

            for (const linha of linhas) {

                const texto = linha.trim();

                if (!texto.startsWith("{")) continue;

                try {

                    const dados = JSON.parse(texto);

                    atualizarDashboard(dados);

                } catch (erro) {

                    console.log(
                        "Mensagem serial ignorada:",
                        texto
                    );

                }

            }

        }

    } catch (erro) {

        console.error("Erro serial:", erro);

    } finally {

        leitor.releaseLock();

        leitor = null;

        if (escritor) {
            try {
                escritor.releaseLock();
            } catch (e) {}
        }

        escritor = null;

        if (porta) {
            try {
                await porta.close();
            } catch (e) {}
        }

        porta = null;
        conectado = false;

        atualizarStatus(
            false,
            "ESP8266 desconectado."
        );

        btnConectar.textContent =
            "Conectar ESP8266";

    }

}

// ==========================================
// ATUALIZAR DASHBOARD
// ==========================================

function atualizarDashboard(dados) {

    const chuva = Number(dados.chuva);
    const prevista = Number(dados.prevista);
    const acumulada = Number(dados.acumulada);
    const risco = Number(dados.risco);

    if (
        !Number.isFinite(chuva) ||
        !Number.isFinite(prevista) ||
        !Number.isFinite(acumulada) ||
        !Number.isFinite(risco)
    ) {
        return;
    }

    if (
        chuva < 0 || chuva > 200 ||
        prevista < 0 ||
        acumulada < 0 ||
        risco < 0 || risco > 100
    ) {
        return;
    }

    // Indicadores

    document.getElementById("chuva").textContent =
        chuva.toFixed(2) + " mm";

    document.getElementById("previsao").textContent =
        prevista.toFixed(2) + " mm";

    document.getElementById("acumulada").textContent =
        acumulada.toFixed(2) + " mm";

    document.getElementById("risco").textContent =
        risco.toFixed(1) + "%";

    document.getElementById("classificacao").textContent =
        dados.classificacao;

    // Cores do risco

    let cor;
    let mensagemRisco;

    if (risco < 25) {

        cor = "#299b65";

        mensagemRisco =
            "Condicoes simuladas de baixo risco.";

    } else if (risco < 50) {

        cor = "#d4a72c";

        mensagemRisco =
            "Atencao ao aumento da precipitacao.";

    } else if (risco < 75) {

        cor = "#e77b2d";

        mensagemRisco =
            "Atencao reforcada aos pontos vulneraveis.";

    } else {

        cor = "#d64545";

        mensagemRisco =
            "Cenario experimental critico.";

    }

    document.getElementById("risco").style.color = cor;

    document.getElementById("classificacao").style.color =
        cor;

    document.getElementById("classificacao").style.background =
        cor + "22";

    document.getElementById("barraRisco").style.width =
        risco + "%";

    document.getElementById("barraRisco").style.background =
        cor;

    document.getElementById("mensagemRisco").textContent =
        mensagemRisco;

    // Atualiza alerta calculado pelo ESP8266

    atualizarAlerta(dados);

}

// ==========================================
// ATUALIZAR ALERTA
// ==========================================

function atualizarAlerta(dados) {

    const configuracoes = {

        NORMAL: {
            classe: "alerta-normal",
            icone: "✓"
        },

        ATENCAO: {
            classe: "alerta-atencao",
            icone: "⚠️"
        },

        ALAGAMENTO: {
            classe: "alerta-alagamento",
            icone: "🌧️"
        },

        "ALTO RISCO": {
            classe: "alerta-alto",
            icone: "🚨"
        },

        CRITICO: {
            classe: "alerta-critico",
            icone: "🔴"
        }

    };

    const config = configuracoes[dados.alerta];

    if (!config) return;

    const indicador =
        document.getElementById("indicadorAlerta");

    indicador.className = config.classe;

    document.getElementById("iconeAlerta").textContent =
        config.icone;

    document.getElementById("nivelAlerta").textContent =
        dados.alerta;

    document.getElementById("mensagemAlerta").textContent =
        dados.mensagem;

}

// ==========================================
// HORA ATUAL EM INDAIATUBA
// ==========================================

function obterHoraLocal() {

    const partes = new Intl.DateTimeFormat(
        "en-CA",
        {
            timeZone: "America/Sao_Paulo",
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            hourCycle: "h23"
        }
    ).formatToParts(new Date());

    const valores = {};

    partes.forEach(parte => {
        valores[parte.type] = parte.value;
    });

    return (
        `${valores.year}-${valores.month}-${valores.day}` +
        `T${valores.hour}`
    );

}

// ==========================================
// CONSULTAR OPEN-METEO
// ==========================================

async function buscarMeteorologia() {

    try {

        const url =
            "https://api.open-meteo.com/v1/forecast" +
            `?latitude=${LATITUDE}` +
            `&longitude=${LONGITUDE}` +
            "&hourly=precipitation" +
            "&past_days=3" +
            "&forecast_days=2" +
            "&timezone=America%2FSao_Paulo";

        const resposta = await fetch(url);

        if (!resposta.ok) {

            throw new Error(
                "Erro ao consultar Open-Meteo."
            );

        }

        const dados = await resposta.json();

        const horarios = dados.hourly.time;

        const precipitacoes =
            dados.hourly.precipitation;

        const horarioAtual = obterHoraLocal();

        const indiceAtual = horarios.findIndex(
            horario => horario.startsWith(horarioAtual)
        );

        if (indiceAtual < 0) {

            throw new Error(
                "Horario atual nao encontrado."
            );

        }

        // Previsao das proximas 3 horas

        chuvaPrevista = 0;

        for (
            let i = indiceAtual + 1;
            i <= indiceAtual + 3;
            i++
        ) {

            chuvaPrevista +=
                Number(precipitacoes[i] || 0);

        }

        // Acumulado das ultimas 72 horas

        chuvaAcumulada = 0;

        const inicio = Math.max(
            0,
            indiceAtual - 72
        );

        for (
            let i = inicio;
            i < indiceAtual;
            i++
        ) {

            chuvaAcumulada +=
                Number(precipitacoes[i] || 0);

        }

        meteorologiaDisponivel = true;

        document.getElementById("statusClima").textContent =
            "Meteorologia atualizada.";

        document.getElementById("atualizacao").textContent =
            new Date().toLocaleString("pt-BR");

        await enviarMeteorologia();

    } catch (erro) {

        meteorologiaDisponivel = false;

        console.error("Erro meteorologico:", erro);

        document.getElementById("statusClima").textContent =
            "Falha na consulta meteorologica.";

    }

}

// ==========================================
// ENVIAR METEOROLOGIA AO ESP8266
// ==========================================

async function enviarMeteorologia() {

    if (!escritor || !meteorologiaDisponivel) {
        return;
    }

    try {

        const mensagem =
            `CLIMA,${chuvaPrevista.toFixed(2)},` +
            `${chuvaAcumulada.toFixed(2)}\n`;

        await escritor.write(
            new TextEncoder().encode(mensagem)
        );

        document.getElementById("statusClima").textContent =
            "Dados enviados ao ESP8266.";

        console.log(
            "Meteorologia enviada:",
            mensagem.trim()
        );

    } catch (erro) {

        console.error(
            "Erro ao enviar meteorologia:",
            erro
        );

    }

}

// ==========================================
// ATUALIZACAO AUTOMATICA
// ==========================================

setInterval(() => {

    if (escritor && conectado) {
        buscarMeteorologia();
    }

}, 15 * 60 * 1000);

// ==========================================
// DETECTAR DESCONEXAO
// ==========================================

if ("serial" in navigator) {

    navigator.serial.addEventListener(
        "disconnect",
        () => {

            atualizarStatus(
                false,
                "ESP8266 desconectado."
            );

            conectado = false;

            btnConectar.textContent =
                "Conectar ESP8266";

        }
    );

}

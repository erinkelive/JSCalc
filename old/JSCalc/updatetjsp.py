# Corrige JS com chaves em aspas simples, transforma para JSON com regex inteligente

import re
import json
from pathlib import Path
from pdfminer.high_level import extract_text

MESES = {
    'JAN': '01', 'FEV': '02', 'MAR': '03', 'ABR': '04',
    'MAI': '05', 'JUN': '06', 'JUL': '07', 'AGO': '08',
    'SET': '09', 'OUT': '10', 'NOV': '11', 'DEZ': '12'
}

def carregar_tabela_existente(path_js):
    with open(path_js, encoding='utf-8') as f:
        conteudo = f.read()
        match = re.search(r'const tabelaTJSP\s*=\s*(\{[\s\S]+?\})\s*;', conteudo)
        if not match:
            raise ValueError("Bloco 'const tabelaTJSP = { ... };' não encontrado.")

        objeto_js = match.group(1)

        # Passo 1: Trocar aspas simples por aspas duplas
        objeto_js = objeto_js.replace("'", '"')

        # Passo 2: Garantir que todas as chaves estejam entre aspas duplas
        objeto_json = re.sub(r'(\{|,)(\s*)([\d]{4}-[\d]{2})(\s*):', r'\1 "\3" :', objeto_js)

        # Passo 3: Remover vírgulas finais antes de chave de fechamento (caso exista)
        objeto_json = re.sub(r',\s*}', '}', objeto_json)

        return json.loads(objeto_json)

def extrair_dados_pdf(path_pdf):
    texto = extract_text(path_pdf)
    linhas = texto.splitlines()
    anos = []
    tabela = {}

    for linha in linhas:
        linha = linha.strip()
        if re.match(r'^(JAN|FEV|MAR|ABR|MAI|JUN|JUL|AGO|SET|OUT|NOV|DEZ)', linha):
            tokens = re.split(r'\s+', linha)
            mes = tokens[0]
            for i, valor_str in enumerate(tokens[1:]):
                if i >= len(anos):
                    continue
                ano = anos[i]
                valor_str = valor_str.replace('.', '').replace(',', '.')
                try:
                    valor = float(valor_str)
                    chave = f"{ano}-{MESES[mes]}"
                    tabela[chave] = valor
                except ValueError:
                    continue
        elif re.match(r'^(1|2)\d{3}(\s+(\d{4})){2,}', linha):
            anos = re.findall(r'(\d{4})', linha)

    return tabela

def atualizar_tabela(tabela_existente, tabela_nova):
    tabela_final = tabela_existente.copy()
    for k, v in tabela_nova.items():
        if k not in tabela_final:
            tabela_final[k] = v
    return tabela_final

def salvar_em_js(dados, destino):
    with open(destino, 'w', encoding='utf-8') as f:
        f.write('const tabelaTJSP = ' + json.dumps(dados, indent=2, ensure_ascii=False) + ';\n')

if __name__ == '__main__':
    path_pdf = Path('FileFetch.pdf')
    path_js = Path('tabela_data2.js')
    output_js = Path('tabela_data2_atualizada.js')

    existente = carregar_tabela_existente(path_js)
    nova = extrair_dados_pdf(path_pdf)
    unificado = atualizar_tabela(existente, nova)
    salvar_em_js(unificado, output_js)
    print(f"✅ Arquivo gerado com sucesso: {output_js}")

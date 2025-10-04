import json
import re
from datetime import datetime

# Carrega os dois arquivos
with open("tabela_data2.js", "r", encoding="utf-8") as f:
    original_content = f.read()

with open("tabela_data2_atualizada.js", "r", encoding="utf-8") as f:
    updated_content = f.read()

# Função para extrair objeto JSON da declaração JS
def extrair_json(conteudo_js):
    inicio = conteudo_js.find("{")
    fim = conteudo_js.rfind("}") + 1
    objeto_js = conteudo_js[inicio:fim]

    # Corrige: troca aspas simples por aspas duplas
    objeto_js = objeto_js.replace("'", '"')

    # Corrige: garante que todas as chaves estejam entre aspas
    objeto_js = re.sub(r'({|,)\s*([\d]{4}-[\d]{2})\s*:', r'\1 "\2":', objeto_js)

    # Corrige: remove vírgula antes do fechamento
    objeto_js = re.sub(r',\s*}', '}', objeto_js)

    return json.loads(objeto_js)

# Converte os dois conteúdos
original_dict = extrair_json(original_content)
atualizado_dict = extrair_json(updated_content)

# Detecta diferenças
novas_chaves = sorted(set(atualizado_dict) - set(original_dict))
valores_alterados = [
    (chave, original_dict[chave], atualizado_dict[chave])
    for chave in original_dict
    if chave in atualizado_dict and original_dict[chave] != atualizado_dict[chave]
]

# Resultado
print("\n📌 Novas entradas detectadas no arquivo atualizado:")
for chave in novas_chaves:
    print(f"+ {chave}: {atualizado_dict[chave]}")

print("\n✏️ Valores alterados em relação ao original:")
for chave, antes, depois in valores_alterados:
    print(f"* {chave}: {antes} -> {depois}")

print("\n📊 Estatísticas:")
print(f"Total original:   {len(original_dict)} entradas")
print(f"Total atualizado: {len(atualizado_dict)} entradas")
print(f"Novas entradas:   {len(novas_chaves)}")
print(f"Alteradas:        {len(valores_alterados)}")
print("\n✅ Comparação concluída em", datetime.now())

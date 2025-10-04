def update_tjsp_via_pdf() -> int:
    print("\n[INFO] Atualizando TJSP via PDF oficial...")
    
    # 1. Baixar o PDF
    if not baixar_pdf_tjsp(CONFIG.TJSP_URL, CONFIG.TJSP_LOCAL_PDF):
        print("[ERRO] Falha ao baixar PDF do TJSP.")
        return 1

    # 2. Extrair dados do PDF
    nova = extrair_dados_pdf_tjsp(CONFIG.TJSP_LOCAL_PDF)
    if not nova:
        print("[ERRO] Nenhum dado extraído do PDF.")
        return 2

    # 3. Verificar se o arquivo JS original existe
    if not Path(CONFIG.TJSP_JS_NAME).exists():
        print(f"[ERRO] Arquivo {CONFIG.TJSP_JS_NAME} não encontrado.")
        return 3

    # 4. Carregar tabela existente
    try:
        antiga = carregar_tabela_tjsp_existente(CONFIG.TJSP_JS_NAME)
    except Exception as e:
        print(f"[ERRO] Falha ao carregar JS existente: {e}")
        return 4

    # 5. Comparar
    unificada, novos, perdidos = comparar_e_atualizar_tjsp(antiga, nova)

    if perdidos:
        print(f"[ERRO] Dados existentes seriam perdidos: {perdidos[:5]}...")
        return 5

    if not novos:
        print("[INFO] Nenhuma entrada nova encontrada. Nada a fazer.")
        return 0

    # 6. Backup + salvar atualizado
    try:
        stamp = dt.datetime.now().strftime("%Y-%m-%d_%H%M%S")
        Path(CONFIG.BACKUP_DIR).mkdir(exist_ok=True)
        shutil.copy2(CONFIG.TJSP_JS_NAME, f"{CONFIG.BACKUP_DIR}/{CONFIG.TJSP_JS_NAME}.{stamp}.bak")
        salvar_tabela_tjsp_em_js(unificada, CONFIG.TJSP_JS_NAME)
        print(f"[OK] {len(novos)} entradas novas adicionadas. Arquivo atualizado com sucesso!")
        return 0
    except Exception as e:
        print(f"[ERRO] Falha ao salvar arquivo atualizado: {e}")
        return 6

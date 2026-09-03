export type AppLanguage = "en" | "fr";

const ui = {
  en: {
    // Sidebar / Nav
    library: "Library",
    compare: "Compare",
    designers: "Designers",
    settings: "Settings",
    collapse_sidebar: "Collapse sidebar",
    expand_sidebar: "Expand sidebar",

    // Settings / Appearance
    appearance: "Appearance",
    theme: "Theme",
    accent_color: "Accent Color",
    reduce_motion: "Reduce Motion",
    reduce_motion_desc: "Disable animations and transitions",
    app_language: "App Language",
    switch_to_light: "Switch to Light Mode",
    switch_to_dark: "Switch to Dark Mode",

    // Command Palette
    search_or_jump: "Search or jump to...",
    no_results: "No results",
    navigate: "Navigate",

    // Tab Bar
    close_tab: "Close tab",
    new_tab: "Open in new tab",
    pinned: "Pinned",

    // Errors & System
    page_error_title: "Something went wrong",
    page_error_description: "An unexpected error occurred. Try refreshing the page.",
    db_init_failed: "Database initialization failed",
    unsaved_changes: "Unsaved changes",
    unsaved_changes_message: "You have unsaved changes. Are you sure you want to leave?",
    leave: "Leave",
    stay: "Stay",

    // Test/Presentation Mode (MainLayout)
    test_mode_banner: "Test Mode Active",
    test_mode_confirm_exit: "Exit test mode and restore the production database?",
    exit_test_mode: "Exit Test Mode",
    toast_test_mode_exited: "Test mode exited successfully",
    toast_test_mode_failed: "Failed to exit test mode",
    presentation_mode_banner: "Presentation Mode Active",
    presentation_mode_confirm_exit: "Exit presentation mode and restore the production database?",
    exit_presentation_mode: "Exit Presentation Mode",
    toast_presentation_exited: "Presentation mode exited successfully",
    toast_presentation_failed: "Failed to exit presentation mode",

    // Undo/Redo
    undo: "Undo",
    redo_prefix: "Redo:",
    undo_prefix: "Undo:",
    undo_failed: "Undo failed",
    redo_failed: "Redo failed",
    action_undone: "Action undone",
    failed_to_undo: "Failed to undo",

    // Common
    close: "Close",
    back: "Back",

    // Validation
    field_required: "This field is required",
    invalid_email: "Invalid email address",
    invalid_url: "Invalid URL",
    invalid_number: "Invalid number",
    invalid_date: "Invalid date",
    must_be_positive: "Must be a positive number",
    max_length_exceeded: "Maximum length exceeded",

    // UI Components
    search: "Search",
    clear_search: "Clear search",
    from_receipt: "From receipt",
    clear_detected_value: "Clear detected value",
    retry: "Retry",
    forward: "Forward",
    operation_failed: "Operation failed",

    // Update Checker
    checking_for_updates: "Checking for updates...",
    up_to_date: "Up to date",
    update_available: "Update available",
    download_and_install: "Download and install",
    downloading_update: "Downloading update...",
    update_check_failed: "Update check failed",
    update_ready: "Update ready",
    restart_now: "Restart now",
    check_again: "Check again",

    // Library grid / proofing (T9)
    proof_text: "Proof text",
    preset_pangram: "Pangram",
    preset_alphabet: "Alphabet",
    preset_numerals: "Numerals",
    proof_size: "Size",
    search_fonts: "Search fonts...",
    sort_family_asc: "Family A-Z",
    sort_family_desc: "Family Z-A",
    all_sources: "All sources",
    all_licences: "All licences",
    only_active: "Active only",
    only_favorites: "Favorites only",
    loading_fonts: "Loading fonts...",
    library_empty: "No fonts in the library yet",
    no_fonts_match: "No fonts match the current filters",
    add_favorite: "Add to favorites",
    remove_favorite: "Remove from favorites",
    font_active: "Font active",
    system_font_locked: "System fonts stay active",
    font_label: "font",
    fonts_label: "fonts",
  },
  fr: {
    // Sidebar / Nav
    library: "Bibliotheque",
    compare: "Comparer",
    designers: "Designers",
    settings: "Parametres",
    collapse_sidebar: "Reduire le panneau lateral",
    expand_sidebar: "Deployer le panneau lateral",

    // Settings / Appearance
    appearance: "Apparence",
    theme: "Theme",
    accent_color: "Couleur d'accent",
    reduce_motion: "Reduire les animations",
    reduce_motion_desc: "Desactiver les animations et transitions",
    app_language: "Langue de l'application",
    switch_to_light: "Passer en mode clair",
    switch_to_dark: "Passer en mode sombre",

    // Command Palette
    search_or_jump: "Rechercher ou aller a...",
    no_results: "Aucun resultat",
    navigate: "Naviguer",

    // Tab Bar
    close_tab: "Fermer l'onglet",
    new_tab: "Ouvrir dans un nouvel onglet",
    pinned: "Epingle",

    // Errors & System
    page_error_title: "Une erreur est survenue",
    page_error_description: "Une erreur inattendue s'est produite. Essayez de rafraichir la page.",
    db_init_failed: "Echec de l'initialisation de la base de donnees",
    unsaved_changes: "Modifications non enregistrees",
    unsaved_changes_message: "Vous avez des modifications non enregistrees. Voulez-vous vraiment quitter ?",
    leave: "Quitter",
    stay: "Rester",

    // Test/Presentation Mode (MainLayout)
    test_mode_banner: "Mode Test Actif",
    test_mode_confirm_exit: "Quitter le mode test et restaurer la base de donnees de production ?",
    exit_test_mode: "Quitter le Mode Test",
    toast_test_mode_exited: "Mode test quitte avec succes",
    toast_test_mode_failed: "Echec de la sortie du mode test",
    presentation_mode_banner: "Mode Presentation Actif",
    presentation_mode_confirm_exit: "Quitter le mode presentation et restaurer la base de donnees de production ?",
    exit_presentation_mode: "Quitter le Mode Presentation",
    toast_presentation_exited: "Mode presentation quitte avec succes",
    toast_presentation_failed: "Echec de la sortie du mode presentation",

    // Undo/Redo
    undo: "Annuler",
    redo_prefix: "Refaire:",
    undo_prefix: "Annuler:",
    undo_failed: "Echec de l'annulation",
    redo_failed: "Echec de la restoration",
    action_undone: "Action annulee",
    failed_to_undo: "Echec de l'annulation",

    // Common
    close: "Fermer",
    back: "Retour",

    // Validation
    field_required: "Ce champ est requis",
    invalid_email: "Adresse email invalide",
    invalid_url: "URL invalide",
    invalid_number: "Nombre invalide",
    invalid_date: "Date invalide",
    must_be_positive: "Doit etre un nombre positif",
    max_length_exceeded: "Longueur maximale depassee",

    // UI Components
    search: "Rechercher",
    clear_search: "Effacer la recherche",
    from_receipt: "Du recu",
    clear_detected_value: "Effacer la valeur detectee",
    retry: "Reessayer",
    forward: "Suivant",
    operation_failed: "Operation echouee",

    // Update Checker
    checking_for_updates: "Verification des mises a jour...",
    up_to_date: "A jour",
    update_available: "Mise a jour disponible",
    download_and_install: "Telecharger et installer",
    downloading_update: "Telechargement de la mise a jour...",
    update_check_failed: "Echec de la verification des mises a jour",
    update_ready: "Mise a jour prete",
    restart_now: "Redemarrer maintenant",
    check_again: "Verifier a nouveau",

    // Library grid / proofing (T9)
    proof_text: "Texte d'epreuve",
    preset_pangram: "Pangramme",
    preset_alphabet: "Alphabet",
    preset_numerals: "Chiffres",
    proof_size: "Taille",
    search_fonts: "Rechercher des polices...",
    sort_family_asc: "Famille A-Z",
    sort_family_desc: "Famille Z-A",
    all_sources: "Toutes les sources",
    all_licences: "Toutes les licences",
    only_active: "Actives uniquement",
    only_favorites: "Favoris uniquement",
    loading_fonts: "Chargement des polices...",
    library_empty: "Aucune police dans la bibliotheque",
    no_fonts_match: "Aucune police ne correspond aux filtres",
    add_favorite: "Ajouter aux favoris",
    remove_favorite: "Retirer des favoris",
    font_active: "Police active",
    system_font_locked: "Les polices systeme restent actives",
    font_label: "police",
    fonts_label: "polices",
  },
} as const;

export type UIKey = keyof typeof ui.en;

export default ui;

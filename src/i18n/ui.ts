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

    // Bulk activation (T10)
    bulk_selected: "selected",
    bulk_activate: "Activate",
    bulk_deactivate: "Deactivate",
    bulk_clear: "Clear selection",
    select_all_shown: "Select all shown",
    select_font: "Select font",
    active_label: "active",

    // Font detail panel (T11)
    detail_info: "Info",
    detail_glyphs: "Glyphs",
    detail_waterfall: "Waterfall",
    detail_styles: "Styles",
    detail_glyph_count: "Glyph count",
    detail_format: "Format",
    detail_source: "Source",
    detail_licence: "Licence",
    detail_designer: "Designer",
    detail_path: "Path",
    detail_tags: "Tags",
    reveal_in_finder: "Reveal in Finder",
    reveal_failed: "Could not reveal the file in Finder",
    new_tag_placeholder: "New tag...",
    add_tag_button: "Add",
    glyphs_basic_latin: "Basic Latin",
    glyphs_latin_1: "Latin-1 Supplement",
    glyphs_punctuation: "Punctuation & symbols",
    open_details: "Open details",

    // Compare view (T12)
    compare_empty: "No fonts pinned. Pin fonts from the library to compare them.",
    pin_font: "Pin font",
    unpin_font: "Unpin font",
    compare_font: "Font",
    compare_proof: "Proof",
    compare_active: "Active",
    drag_reorder: "Drag to reorder",

    // Designer wiki (T13)
    loading_designers: "Loading designers...",
    designers_empty: "No designers yet",
    designer_not_found: "Designer not found",
    back_to_designers: "Back to designers",
    designer_links: "Links",
    designer_fonts_by: "Fonts by this designer",
    designer_bio_placeholder: "Write this designer's biography...",
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

    // Bulk activation (T10)
    bulk_selected: "selectionnees",
    bulk_activate: "Activer",
    bulk_deactivate: "Desactiver",
    bulk_clear: "Effacer la selection",
    select_all_shown: "Selectionner les polices affichees",
    select_font: "Selectionner la police",
    active_label: "actives",

    // Font detail panel (T11)
    detail_info: "Infos",
    detail_glyphs: "Glyphes",
    detail_waterfall: "Cascade",
    detail_styles: "Styles",
    detail_glyph_count: "Nombre de glyphes",
    detail_format: "Format",
    detail_source: "Source",
    detail_licence: "Licence",
    detail_designer: "Designer",
    detail_path: "Chemin",
    detail_tags: "Etiquettes",
    reveal_in_finder: "Afficher dans le Finder",
    reveal_failed: "Impossible d'afficher le fichier dans le Finder",
    new_tag_placeholder: "Nouvelle etiquette...",
    add_tag_button: "Ajouter",
    glyphs_basic_latin: "Latin de base",
    glyphs_latin_1: "Supplement Latin-1",
    glyphs_punctuation: "Ponctuation et symboles",
    open_details: "Ouvrir les details",

    // Compare view (T12)
    compare_empty: "Aucune police epinglee. Epinglez des polices de la bibliotheque pour les comparer.",
    pin_font: "Epingler la police",
    unpin_font: "Depingler la police",
    compare_font: "Police",
    compare_proof: "Epreuve",
    compare_active: "Active",
    drag_reorder: "Glisser pour reordonner",

    // Designer wiki (T13)
    loading_designers: "Chargement des designers...",
    designers_empty: "Aucun designer pour le moment",
    designer_not_found: "Designer introuvable",
    back_to_designers: "Retour aux designers",
    designer_links: "Liens",
    designer_fonts_by: "Polices de ce designer",
    designer_bio_placeholder: "Rediger la biographie de ce designer...",
  },
} as const;

export type UIKey = keyof typeof ui.en;

export default ui;

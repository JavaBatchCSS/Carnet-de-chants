with open('app.js', 'a', encoding='utf-8') as f:
    f.write('''

// --- Keyboard Navigation (Left/Right Arrows) ---
document.addEventListener('keydown', function(e) {
    // Ne pas interférer si l'utilisateur tape dans la barre de recherche
    if (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA') return;
    
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        const container = document.getElementById('book-container');
        if (!container) return;
        
        const pages = Array.from(document.querySelectorAll('.page'));
        if (pages.length === 0) return;
        
        // Find the page currently most visible or at the top
        let currentPageIndex = 0;
        let minDistance = Infinity;
        
        const containerRect = container.getBoundingClientRect();
        
        pages.forEach((page, index) => {
            const rect = page.getBoundingClientRect();
            // Distance from the top of the container
            const distance = Math.abs(rect.top - containerRect.top);
            if (distance < minDistance) {
                minDistance = distance;
                currentPageIndex = index;
            }
        });
        
        let targetIndex = currentPageIndex;
        if (e.key === 'ArrowRight') {
            targetIndex = Math.min(currentPageIndex + 1, pages.length - 1);
        } else if (e.key === 'ArrowLeft') {
            targetIndex = Math.max(currentPageIndex - 1, 0);
        }
        
        if (targetIndex !== currentPageIndex) {
            e.preventDefault(); // Prevent default scrolling
            pages[targetIndex].scrollIntoView({ behavior: 'smooth' });
        }
    }
});
''')

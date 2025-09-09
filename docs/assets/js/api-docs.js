// Mobile menu toggle
document.getElementById("mobileMenuToggle").addEventListener("click", function () {
  document.querySelector(".sidebar").classList.toggle("mobile-open");
});

// TOC highlight using Intersection Observer
document.addEventListener("DOMContentLoaded", function () {
  console.log("API-DOCS.JS: Initializing TOC highlighting...");

  // Get ALL sections - both top-level sections and nested method sections
  const sections = document.querySelectorAll("section[id], .method[id]");
  const navLinks = document.querySelectorAll(".on-page-nav a");

  console.log("API-DOCS.JS: Found sections:", sections.length);
  console.log("API-DOCS.JS: Found nav links:", navLinks.length);

  // Log the section IDs we found
  sections.forEach((s) => {
    console.log("API-DOCS.JS: Section ID:", s.id, "Class:", s.className);
  });

  // Create a map of section IDs to nav links
  const linkMap = {};
  navLinks.forEach((link) => {
    const href = link.getAttribute("href");
    if (href && href.startsWith("#")) {
      const id = href.substring(1);
      linkMap[id] = link;
      console.log("API-DOCS.JS: Mapped link:", href, "→", id);
    }
  });

  // Track which sections are visible
  const visibleSections = new Set();

  // Update active link based on visible sections
  function updateActiveLink() {
    console.log("API-DOCS.JS: updateActiveLink called, visible sections:", Array.from(visibleSections));

    // Remove all active classes
    navLinks.forEach((link) => link.classList.remove("active"));

    // Find the best section to highlight
    // Priority: Most specific (method) > least specific (parent section)
    let bestSection = null;
    let bestPosition = Infinity;
    let bestSpecificity = 0;

    visibleSections.forEach((id) => {
      const section = document.getElementById(id);
      if (section) {
        const rect = section.getBoundingClientRect();
        // Check if this section is near the top of the viewport
        if (rect.top <= 200 && rect.top > -rect.height) {
          // Prioritize method sections (they have a hyphen after the parent name)
          const specificity = id.includes("-") ? 2 : 1;

          // Choose this section if it's more specific, or if equally specific but higher up
          if (
            specificity > bestSpecificity ||
            (specificity === bestSpecificity && Math.abs(rect.top) < Math.abs(bestPosition))
          ) {
            bestPosition = rect.top;
            bestSection = id;
            bestSpecificity = specificity;
          }
        }
      }
    });

    // If no section is near the top, just use the topmost visible one
    if (!bestSection && visibleSections.size > 0) {
      visibleSections.forEach((id) => {
        const section = document.getElementById(id);
        if (section) {
          const rect = section.getBoundingClientRect();
          if (rect.top < bestPosition) {
            bestPosition = rect.top;
            bestSection = id;
          }
        }
      });
    }

    console.log("API-DOCS.JS: Best section to highlight:", bestSection, "Specificity:", bestSpecificity);

    // Highlight the corresponding link
    if (bestSection && linkMap[bestSection]) {
      linkMap[bestSection].classList.add("active");
      console.log("API-DOCS.JS: Added active class to link for:", bestSection);

      // Scroll the sidebar to keep the active link visible
      const activeLink = linkMap[bestSection];
      const sidebar = document.querySelector(".sidebar");
      if (sidebar && activeLink) {
        const linkRect = activeLink.getBoundingClientRect();
        const sidebarRect = sidebar.getBoundingClientRect();

        // Check if link is outside the visible area of the sidebar
        const linkTop = linkRect.top - sidebarRect.top + sidebar.scrollTop;
        const linkBottom = linkTop + linkRect.height;
        const sidebarHeight = sidebar.clientHeight;

        // If link is above the visible area, scroll up
        if (linkTop < sidebar.scrollTop + 100) { // 100px buffer from top
          sidebar.scrollTo({
            top: linkTop - 100,
            behavior: "smooth",
          });
        } // If link is below the visible area, scroll down
        else if (linkBottom > sidebar.scrollTop + sidebarHeight - 100) { // 100px buffer from bottom
          sidebar.scrollTo({
            top: linkBottom - sidebarHeight + 100,
            behavior: "smooth",
          });
        }
      }
    } else if (bestSection) {
      console.log("API-DOCS.JS: No link found in map for section:", bestSection);
    }
  }

  // Create intersection observer
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        const id = entry.target.getAttribute("id");
        console.log("API-DOCS.JS: Intersection event for:", id, "Intersecting:", entry.isIntersecting);
        if (entry.isIntersecting) {
          visibleSections.add(id);
        } else {
          visibleSections.delete(id);
        }
      });
      updateActiveLink();
    },
    {
      rootMargin: "-80px 0px -70% 0px", // More aggressive detection for smaller sections
      threshold: 0, // Trigger as soon as any part is visible
    },
  );

  console.log("API-DOCS.JS: Starting to observe sections...");
  // Observe all sections
  sections.forEach((section) => {
    observer.observe(section);
    console.log("API-DOCS.JS: Now observing section:", section.id);
  });

  console.log("API-DOCS.JS: Setup complete!");
});

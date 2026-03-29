import * as React from "react";
import { ChevronLeft, ChevronRight, MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { ButtonProps, buttonVariants } from "@/components/ui/button";

interface PaginationProps extends React.ComponentProps<"nav"> {
  currentPage: number;
  totalPages: number;
  onPageChange?: (page: number) => void;
  siblingCount?: number;
  showFirstLast?: boolean;
}

const Pagination = React.forwardRef<HTMLElement, PaginationProps>(
  (
    {
      className,
      currentPage,
      totalPages,
      onPageChange,
      siblingCount = 1,
      showFirstLast = false,
      ...props
    },
    ref
  ) => {
    const handlePageChange = (page: number) => {
      if (onPageChange) {
        onPageChange(Math.max(1, Math.min(page, totalPages)));
      }
    };

    const renderPageNumbers = () => {
      const pages = [];
      const leftBound = Math.max(1, currentPage - siblingCount);
      const rightBound = Math.min(totalPages, currentPage + siblingCount);

      // Always show first page if not in current range
      if (leftBound > 1) {
        pages.push(1);
        if (leftBound > 2) {
          pages.push("ellipsis-left");
        }
      }

      // Show pages around current page
      for (let i = leftBound; i <= rightBound; i++) {
        pages.push(i);
      }

      // Always show last page if not in current range
      if (rightBound < totalPages) {
        if (rightBound < totalPages - 1) {
          pages.push("ellipsis-right");
        }
        pages.push(totalPages);
      }

      return pages.map((page, index) => {
        if (page === "ellipsis-left" || page === "ellipsis-right") {
          return (
            <PaginationItem key={`ellipsis-${index}`}>
              <PaginationEllipsis />
            </PaginationItem>
          );
        }

        return (
          <PaginationItem key={page}>
            <PaginationLink
              isActive={currentPage === page}
              onClick={() => handlePageChange(Number(page))}
            >
              {page}
            </PaginationLink>
          </PaginationItem>
        );
      });
    };

    return (
      <nav
        ref={ref}
        role="navigation"
        aria-label="pagination"
        className={cn("mx-auto flex w-full justify-center", className)}
        {...props}
      >
        <PaginationContent>
          {showFirstLast && (
            <PaginationItem>
              <PaginationFirst
                onClick={() => handlePageChange(1)}
                disabled={currentPage === 1}
              />
            </PaginationItem>
          )}
          <PaginationItem>
            <PaginationPrevious
              onClick={() => handlePageChange(currentPage - 1)}
              disabled={currentPage === 1}
            />
          </PaginationItem>
          {renderPageNumbers()}
          <PaginationItem>
            <PaginationNext
              onClick={() => handlePageChange(currentPage + 1)}
              disabled={currentPage === totalPages}
            />
          </PaginationItem>
          {showFirstLast && (
            <PaginationItem>
              <PaginationLast
                onClick={() => handlePageChange(totalPages)}
                disabled={currentPage === totalPages}
              />
            </PaginationItem>
          )}
        </PaginationContent>
      </nav>
    );
  }
);
Pagination.displayName = "Pagination";

const PaginationContent = React.forwardRef<
  HTMLUListElement,
  React.ComponentProps<"ul">
>(({ className, ...props }, ref) => (
  <ul
    ref={ref}
    className={cn("flex flex-row items-center gap-1", className)}
    {...props}
  />
));
PaginationContent.displayName = "PaginationContent";

const PaginationItem = React.forwardRef<
  HTMLLIElement,
  React.ComponentProps<"li">
>(({ className, ...props }, ref) => (
  <li ref={ref} className={cn("", className)} {...props} />
));
PaginationItem.displayName = "PaginationItem";

interface PaginationLinkProps extends React.ComponentProps<"button"> {
  isActive?: boolean;
  disabled?: boolean;
}

const PaginationLink = React.forwardRef<HTMLButtonElement, PaginationLinkProps>(
  ({ className, isActive, disabled, ...props }, ref) => (
    <button
      ref={ref}
      aria-current={isActive ? "page" : undefined}
      disabled={disabled}
      className={cn(
        buttonVariants({
          variant: isActive ? "outline" : "ghost",
          size: "icon",
        }),
        "min-w-9",
        disabled && "opacity-50 pointer-events-none",
        className
      )}
      {...props}
    />
  )
);
PaginationLink.displayName = "PaginationLink";

interface PaginationControlProps extends PaginationLinkProps {
  direction: "previous" | "next" | "first" | "last";
}

const PaginationControl = React.forwardRef<
  HTMLButtonElement,
  PaginationControlProps
>(({ className, direction, disabled, ...props }, ref) => {
  const icons = {
    previous: <ChevronLeft className="h-4 w-4" />,
    next: <ChevronRight className="h-4 w-4" />,
    first: (
      <>
        <ChevronLeft className="h-4 w-4" />
        <ChevronLeft className="h-4 w-4 -ml-2" />
      </>
    ),
    last: (
      <>
        <ChevronRight className="h-4 w-4" />
        <ChevronRight className="h-4 w-4 -ml-2" />
      </>
    ),
  };

  const labels = {
    previous: "Previous",
    next: "Next",
    first: "First",
    last: "Last",
  };

  return (
    <button
      ref={ref}
      aria-label={`Go to ${direction} page`}
      disabled={disabled}
      className={cn(
        buttonVariants({
          variant: "ghost",
          size: "default",
        }),
        "gap-1 px-2.5",
        disabled && "opacity-50 pointer-events-none",
        className
      )}
      {...props}
    >
      {direction === "previous" || direction === "first" ? (
        <>
          {icons[direction]}
          <span className="sr-only sm:not-sr-only">{labels[direction]}</span>
        </>
      ) : (
        <>
          <span className="sr-only sm:not-sr-only">{labels[direction]}</span>
          {icons[direction]}
        </>
      )}
    </button>
  );
});
PaginationControl.displayName = "PaginationControl";

const PaginationPrevious = React.forwardRef<
  HTMLButtonElement,
  Omit<PaginationControlProps, "direction">
>((props, ref) => (
  <PaginationControl ref={ref} direction="previous" {...props} />
));
PaginationPrevious.displayName = "PaginationPrevious";

const PaginationNext = React.forwardRef<
  HTMLButtonElement,
  Omit<PaginationControlProps, "direction">
>((props, ref) => (
  <PaginationControl ref={ref} direction="next" {...props} />
));
PaginationNext.displayName = "PaginationNext";

const PaginationFirst = React.forwardRef<
  HTMLButtonElement,
  Omit<PaginationControlProps, "direction">
>((props, ref) => <PaginationControl ref={ref} direction="first" {...props} />);
PaginationFirst.displayName = "PaginationFirst";

const PaginationLast = React.forwardRef<
  HTMLButtonElement,
  Omit<PaginationControlProps, "direction">
>((props, ref) => <PaginationControl ref={ref} direction="last" {...props} />);
PaginationLast.displayName = "PaginationLast";

const PaginationEllipsis = ({
  className,
  ...props
}: React.ComponentProps<"span">) => (
  <span
    aria-hidden
    className={cn(
      "flex h-9 w-9 items-center justify-center text-muted-foreground",
      className
    )}
    {...props}
  >
    <MoreHorizontal className="h-4 w-4" />
    <span className="sr-only">More pages</span>
  </span>
);
PaginationEllipsis.displayName = "PaginationEllipsis";

export {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
  PaginationFirst,
  PaginationLast,
};

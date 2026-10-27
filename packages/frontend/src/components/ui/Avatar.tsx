import { HTMLAttributes, forwardRef } from 'react';
import { cn, getInitials, stringToColor, getContrastColor } from '../../utils/helpers';

export interface AvatarProps extends HTMLAttributes<HTMLDivElement> {
  src?: string | null;
  alt?: string;
  name?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  shape?: 'circle' | 'square';
  status?: 'online' | 'offline' | 'busy' | 'away';
  statusPosition?: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
}

const sizes = {
  xs: 'h-6 w-6 text-xs',
  sm: 'h-8 w-8 text-sm',
  md: 'h-10 w-10 text-base',
  lg: 'h-12 w-12 text-lg',
  xl: 'h-16 w-16 text-xl',
  '2xl': 'h-24 w-24 text-2xl',
};

const statusSizes = {
  xs: 'h-1.5 w-1.5',
  sm: 'h-2 w-2',
  md: 'h-2.5 w-2.5',
  lg: 'h-3 w-3',
  xl: 'h-4 w-4',
  '2xl': 'h-5 w-5',
};

const statusPositions = {
  'bottom-right': 'bottom-0 right-0',
  'bottom-left': 'bottom-0 left-0',
  'top-right': 'top-0 right-0',
  'top-left': 'top-0 left-0',
};

const statusColors = {
  online: 'bg-green-500',
  offline: 'bg-secondary-400',
  busy: 'bg-red-500',
  away: 'bg-yellow-500',
};

export const Avatar = forwardRef<HTMLDivElement, AvatarProps>(
  ({ 
    className, 
    src, 
    alt, 
    name, 
    size = 'md', 
    shape = 'circle', 
    status, 
    statusPosition = 'bottom-right',
    ...props 
  }, ref) => {
    const shapeClass = shape === 'circle' ? 'rounded-full' : 'rounded-lg';
    
    // Generate fallback color from name
    const bgColor = name ? stringToColor(name) : 'hsl(221, 83%, 53%)';
    const textColor = name ? getContrastColor(bgColor.replace('hsl', '').replace(/[()%]/g, '').split(',').map(Number).reduce((acc, val) => acc + val.toString(16).padStart(2, '0'), '#')) : '#FFFFFF';

    return (
      <div
        ref={ref}
        className={cn('relative inline-flex items-center justify-center overflow-hidden bg-secondary-100 dark:bg-secondary-800', sizes[size], shapeClass, className)}
        {...props}
      >
        {src ? (
          <img
            src={src}
            alt={alt || name || 'Avatar'}
            className="h-full w-full object-cover"
          />
        ) : name ? (
          <span
            className="font-medium"
            style={{ backgroundColor: bgColor, color: textColor }}
          >
            {getInitials(name)}
          </span>
        ) : (
          <svg className="h-full w-full text-secondary-400" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
          </svg>
        )}
        
        {status && (
          <span
            className={cn(
              'absolute border-2 border-white dark:border-secondary-900 rounded-full',
              statusSizes[size],
              statusColors[status],
              statusPositions[statusPosition]
            )}
            aria-label={status}
          />
        )}
      </div>
    );
  }
);

Avatar.displayName = 'Avatar';

export interface AvatarGroupProps extends HTMLAttributes<HTMLDivElement> {
  avatars: (AvatarProps & { key: string })[];
  max?: number;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  overlap?: number;
}

export function AvatarGroup({ 
  avatars, 
  max = 5, 
  size = 'md', 
  overlap = -8,
  className,
  ...props 
}: AvatarGroupProps) {
  const visibleAvatars = avatars.slice(0, max);
  const remainingCount = avatars.length - max;

  return (
    <div className={cn('flex -space-x-2', className)} {...props}>
      {visibleAvatars.map(({ key: avatarKey, ...avatar }, index) => (
        <Avatar
          key={avatarKey}
          {...avatar}
          size={size}
          className={cn('ring-2 ring-white dark:ring-secondary-900', avatar.className)}
          style={{ zIndex: max - index, marginLeft: index > 0 ? overlap : 0 }}
        />
      ))}
      
      {remainingCount > 0 && (
        <div
          className={cn(
            'flex items-center justify-center bg-secondary-100 dark:bg-secondary-800 border-2 border-white dark:border-secondary-900 font-medium',
            sizes[size],
            'rounded-full'
          )}
          style={{ zIndex: 0, marginLeft: overlap }}
        >
          +{remainingCount}
        </div>
      )}
    </div>
  );
}
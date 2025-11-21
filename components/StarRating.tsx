import React from 'react';
import { Star, StarHalf } from 'lucide-react';

interface StarRatingProps {
  rating: number;
  size?: 'sm' | 'md' | 'lg';
  showCount?: boolean;
  count?: number;
  color?: string;
}

export const StarRating: React.FC<StarRatingProps> = ({ 
  rating, 
  size = 'md', 
  showCount = false, 
  count = 0,
  color = "text-[#00AA6C]"
}) => {
  const stars = [];
  const sizeClasses = {
    sm: "w-3 h-3",
    md: "w-4 h-4",
    lg: "w-5 h-5"
  };

  for (let i = 1; i <= 5; i++) {
    if (rating >= i) {
      stars.push(<Star key={i} className={`${sizeClasses[size]} fill-current ${color}`} />);
    } else if (rating >= i - 0.5) {
      stars.push(<StarHalf key={i} className={`${sizeClasses[size]} fill-current ${color}`} />);
    } else {
      stars.push(<Star key={i} className={`${sizeClasses[size]} text-gray-300 fill-gray-300`} />);
    }
  }

  return (
    <div className="flex items-center gap-1">
      <div className="flex gap-0.5">
        {stars}
      </div>
      {showCount && (
        <span className="text-sm text-gray-600 ml-1 font-medium">
          {count} opiniones
        </span>
      )}
    </div>
  );
};
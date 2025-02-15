import math

def haversine_distance(coord1, coord2):
    try:
        R = 6371000  # 地球の半径（メートル単位）
        lat1, lon1 = float(coord1[1]), float(coord1[0])  # Decimal を float にキャスト
        lat2, lon2 = float(coord2[1]), float(coord2[0])  # Decimal を float にキャスト

        if None in [lat1, lon1, lat2, lon2]:
            raise ValueError("Coordinates must not contain None values.")

        phi1 = math.radians(lat1)
        phi2 = math.radians(lat2)
        delta_phi = math.radians(lat2 - lat1)
        delta_lambda = math.radians(lon2 - lon1)

        a = math.sin(delta_phi / 2.0) ** 2 + \
            math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2.0) ** 2
        c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
        return R * c
    except Exception as e:
        print(f"Error in haversine_distance calculation: {str(e)}")
        return float('inf')  # 無効な距離を示す大きな値を返す

def is_within_radius(vehicle_location, center_point, radius_meters):
    """
    Check if the vehicle is within the specified radius from the center point.
    """
    distance = haversine_distance(vehicle_location, center_point)
    return distance <= radius_meters

def is_within_any_radius(vehicle_location, points_with_radius):
    """
    Check if the vehicle is within any of the specified radii from the list of center points.
    """
    for point in points_with_radius:
        center_point = point['coordinates']
        radius_meters = point.get('properties', {}).get('radius')
        if radius_meters is None:
            continue  # Skip if radius is not specified
        if is_within_radius(vehicle_location, center_point, radius_meters):
            return True
    return False

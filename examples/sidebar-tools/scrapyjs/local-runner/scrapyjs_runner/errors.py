class Fault(Exception):
    def __init__(self, code, message=None, status=422):
        self.code = code
        self.message = message or code
        self.status = status
        super().__init__(self.message)

    def public(self):
        return {'code': self.code, 'message': self.message}
